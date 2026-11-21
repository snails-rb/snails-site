---
title: Why I didn't rewrite my Rails app in Rust
description: A deploy brought my 1 GB Rails API service down. Rust was the obvious answer, but it made the code heavier to read. I kept the Rails conventions, dropped the layers, and let coding agents write what used to be a gem. The result is native performance with the same conventions.
date: 2026-11-20
updated: 2026-11-20
author: Rinn
---

*Disclosure: I'm the author of Snails, the framework this post is about. The numbers are from my own deploys, not a lab.*

In October, a deploy brought my Rails API service down. The app is a telemetry backend: five services send metrics and logs over OTLP/HTTP to three routes. It was a stock Rails 8.1 API app on a 1 GB node with 951 MB usable, running a single Puma process, not cluster mode. The node was the smallest free-tier box I wanted the service to run on, and the question was whether the full Rails stack could fit it.

At steady state, the app process used about 175 MB, and with Postgres running, the node sat at 504 MB. Kamal starts the new container before it stops the old one, so a deploy runs two Rails processes. The new process peaks higher during boot than its steady 175 MB; with the old process still serving, the node runs out of headroom and swaps. Deploys stretched from 70–80 seconds to 200–300 seconds, and one froze the node; I had to force a reboot.

I assumed Postgres was using most of the memory. I moved the database to SQLite to remove the container and turned on zram. The deploy peak didn't move; zram only made a freeze less likely. Rails 8.1 already preloads jemalloc, so the allocator wasn't it either.

The full Rails stack, not the app code, was the problem: a deploy had to fit two processes, and one was already at 175 MB. On a 1 GB node, I couldn't find anything left to tune.

Rust was the obvious answer. I had already ported another service to Rust, and it worked. I didn't port this one. This post is about why, and what I built instead.

## Rust, already shipped

The port was for another Rails service, a smaller mobile API. It covered the API handlers and a job worker. The job worker is where I measured the memory: about 360 MB for the Rails job container, about 2 MB for the Rust service that replaced it, on the same 1 GB node. It's one data point, not a benchmark. But the gap was real.

The port did what I wanted. If memory were the only goal, I would have stopped there.

What stopped me wasn't the memory. It was the code. I'm the one who has to read it.

Rust's explicitness is what makes it good for an agent: static types, explicit contracts, no magic. The same property makes the code heavy for a human to read. The syntax gets familiar; the amount of code doesn't. Here is the same endpoint in both services.

Rails, `Api::DevicesController#show`:

```ruby
class Api::DevicesController < Api::ApplicationController
  def show
    @device = Device.find_by!(uuid: params[:id])
  end
end
```

Rust, `api-gateway` `devices::show`:

```rust
pub async fn show(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(uuid): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let _auth = auth::authenticate(&headers, &state).await?;
    let pool = state
        .pool
        .as_ref()
        .ok_or_else(|| ApiError::Internal("database not configured".to_string()))?;

    match core_db::find_device_by_uuid(pool, &uuid).await? {
        Some(device) => Ok(Json(device_json(&device))),
        None => Err(ApiError::NotFound(locale::from_headers(&headers))),
    }
}
```

The action is three lines because the rest lives elsewhere: auth is a `before_action` on the base controller, `find_by!` raises `RecordNotFound` and the base controller turns it into a 404, and the JSON is a jbuilder view. The Rust handler carries all of it: the auth call, the pool, the error mapping, the lookup, the 404, and the JSON helper. An agent wrote this handler. It's correct, typed, and explicit. It's also more code to read than the Rails action it replaces. The agent can produce it faster than I can read it.

I could read it. I didn't want to pay that cost every time I opened the file, and I found myself paying it less and less.

That left more of the decisions to the agent: error handling, security boundaries, cost trade-offs. I use coding agents, but I run this service. At 3 a.m., I need to know what the code decided. Reading is how I debug, judge the agent's fix, and catch a regression.

That's the cost I feel every day. Reading a small codebase is manageable. The problem is how fast it grows: an agent writes more code than I can review, and Rust gives it more code per behavior. The gap grows with every feature. Then I stopped reading. The service still ran, but I couldn't explain what it would do next. It had become a black box. That was the bigger problem.

Rust worked, but I didn't want to own it. I wanted the memory drop and code I could keep reading.

## Why not a bigger node?

The other obvious answer was a bigger node. Amazon Free Tier and Oracle Always Free both offer a 1 GB option, and that was the box I wanted the service to run on. A 2 GB node would have fixed the deploy: the two Rails processes would have had room to overlap, and I could have run Puma in cluster mode.

Cost wasn't the point. Performance was. The bigger node would have solved the deploy by adding memory, not by making Rails need less of it. The Rust service already ran on 1 GB. The question was whether the Rails conventions could survive on the same hardware.

A framework that needs more than the smallest free-tier node isn't usable for this class of service. That was the constraint I wasn't willing to give up. I wanted to keep the conventions inside it. That meant removing the stack that made them expensive to run.

## Roundhouse kept the Rails stack

I tried [Roundhouse](https://rubys.github.io/roundhouse/) first. It's Sam Ruby's transpiler: it reads a Rails app as-is and emits a standalone project. One target is [Spinel](https://github.com/matz/spinel), Matz's ahead-of-time Ruby compiler.

Roundhouse treats the Rails app as the source. It analyzes the app, builds a typed intermediate representation, and emits a standalone project for a target. The Ruby/Spinel target compiles the app and the Rails framework into one binary. The framework is compiled, not removed, so the Rails stack comes with it. The output is regenerated, not edited: the Rails app stays the source, and patching the output is a bug report, not a workflow.

That path only covers the Rails constructs Roundhouse can model. An app outside that subset won't convert, and an app inside it is still a Rails app with a generated native build.

The binary worked: 2.8 MB on disk, about 19 MB RSS while serving requests. The memory goal was met. But the memory was the only goal it met.

The Rails stack was still there. Roundhouse removed the CRuby process, not the layers: Active Record, the gems, and the Ruby runtime those layers need were still in the binary.

The subset was still the limit.

The source was still Rails. I wanted the app source to be the code I read and change: the controllers, forms, jobs, and tests below. With Roundhouse, the binary is a build artifact of the Rails app.

I wanted a framework for other API apps that kept the Rails conventions and removed the layers Rails added to make writing easier — Active Record, the HTML view layer, and the gems — along with the Ruby runtime those layers need.

I could have contributed to Roundhouse instead. But I wanted a framework, not a transpiler. So I created Snails.

The memory was about the same as Roundhouse's. The difference was that the code I was reading was the code I was running.

## Snails

Snails is a Rails-like framework for API-only Ruby apps. It keeps the Rails conventions and compiles the app, the framework, and the HTTP server into one native binary with Spinel. The app is still Ruby source. There is no transpiled source: the files you write are the files the compiler reads. There is no Ruby VM or Rails stack at runtime. It has no gem dependencies. The [Snails Design](/blog/the-snails-design/) makes the argument; this post is the test.

## What survived

The request path looks familiar. The model layer doesn't.

### Routes

```ruby
# config/routes.rb
module Snails
  module RouteTable
    def self.table
      [
        get("/up", Snails::HealthController, :show),
        *resources("/v1/metrics", MetricsController, :json, [ :create ]),
        *resources("/v1/logs", LogsController, :json, [ :create ])
      ]
    end
  end
end

RouteHelpers.metrics_path # "/v1/metrics"
```

The route table uses the same `get`/`resources` helpers as Rails, but the rows are a plain array of controller classes and actions, not `Rails.application.routes.draw`. The table is a plain list because the route helpers are generated from it at build time, not from a `draw` block at boot.

### Controllers

```ruby
class MetricsController < ApplicationController
  include IngestRejection
  include BearerAuth
  include OtlpRequestBody

  before_action :authenticate_bearer!
  before_action :parse_body

  def create
    rows = OtlpDecoder.new(parsed_body).rows
    MetricSample.upsert_rows!(rows)
    head(:ok)
  rescue Sqlx::RecordInvalid => e
    reject_ingest("invalid_rows", :unprocessable_content, rows.size, e.record.errors.join(", "))
  end
end

# app/controllers/concerns/bearer_auth.rb
module BearerAuth
  private

  def authenticate_bearer!
    account_id = account_id_from_bearer
    if account_id.nil?
      reject_unauthorized
    else
      @account_id = account_id
    end
  end
end
```

`ApplicationController`, `before_action`, and `def create` are standard Rails. The concerns are plain Ruby modules: no `ActiveSupport::Concern`, no `included do`; the controller registers the filters itself. The `Sqlx::RecordInvalid` rescue is Snails-specific.

### Forms

```ruby
class MetricSampleForm < Snails::Form
  KINDS = %w[counter delta gauge].freeze

  validates :account_id, presence: true
  validate :account_id_is_a_count
  validates :ts, presence: true
  validate :ts_is_a_time
  validates :kind, inclusion: { in: KINDS }, allow_blank: true
  validate :labels_are_flat
  validate :value_is_finite
end
```

The `validates` DSL is standard Rails validation. Rails keeps those rules on the Active Record model; Snails puts them in a form. The form validates input, and the `Sqlx` model writes rows.

### Jobs

```ruby
class MetricsRollupPruneJob < ActiveJob::Base
  def self.perform(data)
    Account.all.each do |account|
      days = account.retention_policy.metrics_days
      Metrics5mWindow.prune_before!(account.id, days.days.ago)
    end
  end
end

ActiveJob.recurring(MetricsRollupPruneJob, schedule: "0 6 * * *")
```

`ActiveJob::Base` is the Rails base class, but Snails declares every job in code. Rails 8's Solid Queue puts recurring tasks in `config/recurring.yml`; Snails keeps the schedule in Ruby code. `ActiveJob.recurring` is one line in `config/environment.rb`. The job API is three calls in the `ActiveJob` namespace: `ActiveJob.enqueue` for a one-off job, `ActiveJob.schedule` for a delayed one, and `ActiveJob.recurring` for a recurring one. The class-side `perform` is the job body.

### Tests

```ruby
class MetricsIngestTest < Snails::Harness::IntegrationTest
  test "ingest accepts valid payload" do
    post_raw("/v1/metrics", gauge_json("server-proxy"), json_headers)
    assert_response 200
    assert_equal 1, MetricSample.count
  end
end
```

The test sends a real HTTP request and reads the table. The assertions are standard Rails integration-test assertions. The harness resets the database tables and runs `setup` before each case.

Routes, controllers, forms, jobs, and tests still use Rails conventions. The model layer does not: it is a plain `Sqlx::Base` class.

## What it cost

Active Record was the biggest change. I didn't use associations or callbacks in this app, but I did use relation chaining and validations. Models are plain `Sqlx::Base` classes, and reads and writes go through `Sqlx`, the framework's SQL API. The cost was real: more code, not harder code.

### Read path

The read path is the common case. Rails relation chaining builds the SQL from calls like `where`, `order`, `offset`, and `limit`:

```ruby
# Rails
ApiToken.where(account_id: id).order(id: :desc).offset(40).limit(20)

# Snails
ApiToken.fetch_many({ account_id: id }, order: :desc, offset: 40, limit: 20)
```

Snails has a fixed set of finders for common queries. A query that groups or joins has no finder. It is SQL:

```ruby
# Rails
MetricSample.where(account_id: id).group(:service).count
# => { "api" => 120, "worker" => 80 }

# Snails
MetricSample.rows_by_sql(
  "SELECT service, COUNT(*) AS total FROM metric_samples WHERE account_id = ? GROUP BY service",
  [id]
)
# => [{ "service" => "api", "total" => 120 }, { "service" => "worker", "total" => 80 }]
```

The second query is longer; it is plain SQL with bound values.

### Write path

Validation moved to forms. The write path was the bigger job: validation, batching, and the derived tables are now explicit steps.

This is the write path for one batch:

```ruby
class MetricSample < Sqlx::Base
  def self.table_name = "metric_samples"

  def self.upsert_rows!(rows)
    forms = rows.map { |row| MetricSampleForm.new(row) }
    forms.each { |form| raise Sqlx::RecordInvalid, form unless form.valid? }

    stored = forms.map do |form|
      { account_id: form.account_id, ts: form.ts, service: form.service,
        host: form.host, metric: form.metric, kind: form.kind,
        labels: JSON.generate(form.labels.sort.to_h), value: form.value }
    end

    transaction do
      count = 0
      stored.each_slice(500) do |batch|
        count += upsert_all!(batch, unique_by: %i[account_id ts service host metric labels])
      end
      MetricSeriesLatest.upsert_newer!(stored)
      Metrics5mWindow.refresh!(stored)
      count
    end
  end
end
```

The form validates each row. The model writes the raw rows and the two derived tables, the latest series and the five-minute window, in one transaction. The 500-row batches keep each statement under SQLite's bind limit. There are no callbacks; the refresh is a line in the method. The tests check the derived tables, so a forgotten refresh fails the suite.

Removing Active Record takes more code. The code is plain Ruby: no metaprogramming, no callback chains, no hidden side effects. The write steps are explicit in the method, in the order they run. A Rails version without callbacks would look much the same; the Snails-specific cost is the form and the plain model layer.

### Spinel

Spinel was the other cost. While I was building Snails, I filed more than twenty Spinel issues: compiler bugs, missing constants, and cases where the emitted code didn't match the source. The hard part was doing both at once: debugging the compiler, filing issues, waiting for fixes, and building the framework. Most fixes landed the same day. Spinel is much more stable now and production-ready; it is still improving every day. The issues are in the [Spinel issue tracker](https://github.com/matz/spinel/issues?q=author%3Akslrinn).

## What the numbers say

The Rails baseline was about 175 MB for the app process and 504 MB on the node. The Snails build's app process is about 20 MB RSS; the binary is 4.3 MB. The node is using 362 MB.

| Measure | Rails baseline | Snails build |
|---|---:|---:|
| App process memory | ~175 MB | ~20 MB |
| Node used | 504 MB | 362 MB |
| Node available | 447 MB | 589 MB |
| Binary on disk | — | 4.3 MB |
| Database | Postgres container | SQLite in the app |
| Server | one Puma process | one native process |

The app process dropped by about 155 MB. The node's used memory dropped by 142 MB, and available memory rose by the same amount. The node also runs a query agent and the proxy now, so its memory use fell by less than the app process did. The database moved from a Postgres container to SQLite in the app. That change shows up in the node's memory, not in the app process.

The Rails baseline is from the October deploy. The Snails numbers are from the production node now. The current numbers are steady-state measurements: process RSS for the app, `free -m` for the node, and `ls -lh` for the binary. This is one service, not a benchmark.

Throughput is a separate question. The server is one native process, multi-threaded, across all cores: no worker processes, no GVL. The [snails-benchmark](https://github.com/snails-rb/snails-benchmark) repo has a measurement on `/up` against Rails in cluster mode, with the method and raw results.

Rails conventions, native performance. The code shows the first; the numbers show the second. Neither is the trade. The trade is in the features I gave up.

## The trade-off

The obvious trade is Active Record, gems, and HTML views. For an API app, views are already out of scope. The real trade is the dependencies themselves: Active Record, the web server, the cron parser, the validation library.

A few years ago, that would have sounded insane. Drop gem compatibility? Write your own web server and cron parser? You'd be rebuilding a decade of work. Coding agents change the math. They can write the code you'd otherwise get from a gem, and you can read it. Snails is the proof: the web server, the cron parser, and the rest are implemented in the framework, only as much as it needs. The cron parser is one file: it accepts the five-field grammar the scheduler needs and rejects everything else at parse time. The app does the same at its level: it implements what it needs instead of adding a gem.

Snails starts from one assumption: agents write the code, and developers read it. That assumption is what makes the trade possible. If the agent can write the web server, the cron parser, and the forms, I don't need a gem for them. I need code I can read.

That's why I didn't rewrite in Rust. Rust and Rails sit at opposite ends of the same trade-off. Rust's explicitness is built into the language, and that is an advantage. It is also why the code is heavy to read. Rails optimized for the developer and accepted the performance cost. Snails is my attempt to take the best of both: the Rails conventions, an explicit model, and native performance. Whether that balance holds beyond this app is the open question.

## What would you not give up?

The question for your app is not whether you can live without Active Record. It's whether you're willing to own the code that used to be a gem. Would you remove Active Record, cut the external dependencies, and write the pieces yourself?

If the answer is no, stay on Rails. The memory problem is real, but the choice is yours.

Snails is at 1.x, and the public API is stable. The conventions are the compatibility promise, and they won't change.

If you try Snails and encounter any issues, please let me know. Open a discussion or file an issue naming the Rails convention you would miss.

The [manual's Coming from Rails chapter](/manual/coming-from-rails/) covers the port. The [Snails Design](/blog/the-snails-design/) makes the case. The [repository](https://github.com/snails-rb/snails) has the code, and the [benchmark](https://github.com/snails-rb/snails-benchmark) has the method and raw results.

What would you not give up?
