---
title: The Snails Design
description: The design choices behind Snails — Rails conventions without the runtime overhead.
date: 2026-11-13
author: Snails
---

Snails is a Rails-like framework for API-only Ruby apps. It keeps the Rails conventions that make an API app predictable — routes, controllers, form objects, mailers, jobs, and a conventional folder layout — and compiles the app, the framework, and the HTTP server into one native executable. The design keeps the developer-friendly Rails conventions and removes the abstractions that were chosen for human writing and added runtime overhead.

## Rails' abstraction trade

Rails is developer-friendly because it abstracts work a human would otherwise do: ActiveRecord hides SQL, the view layer and asset pipeline hide the browser stack, and gems supply behavior a team would otherwise build. Those abstractions made a human team faster, and Rails accepted the runtime overhead: a Ruby runtime, a GVL, worker processes, and layers between the request and the database.

Coding agents change that trade-off. They write SQL, maintain a backend and a frontend as two stacks, and implement the missing behavior instead of adding a dependency. The abstractions that saved a human team time now add layers an agent does not need and a human has to trust. Snails keeps the Rails conventions and the developer-friendly API style, and removes the layers that add runtime overhead: no ORM, no view layer, no gem compatibility, one native binary. The developer-friendly conventions no longer have to carry that overhead.

A common argument now is that abstraction is over. The claim is too broad. The more specific claim is that the abstractions Rails chose for human writing no longer justify their runtime overhead when agents write the code. Abstraction is still necessary, but it must be light and shared: conventions and rules the agent follows and the reviewer checks. The agent produces predictable code; the reviewer checks the route, the SQL, the migration, and the test evidence, and decides what ships. Review is the constraint, not the reason for the design. The reason is the abstraction trade: keep what makes Rails productive, remove what makes it slow.

## Predictable Rails conventions

The point of the Rails conventions is predictability: an agent can add code without inventing a layout, and a human knows where to look. Routes live in `config/routes.rb`, controllers are classes with actions, forms own validation, mailers and jobs have their own folders, and migrations are numbered files. A new endpoint has one obvious place, and a human can find the request path without a map. The [Coming from Rails](/manual/coming-from-rails/) chapter is the translation table for the habits that carry over and the ones that do not.

## The frontend is a separate app

Rails 7 made Hotwire (Turbo and Stimulus) the default frontend for new apps. That stack is part of Rails' server-rendered default. Snails removes the Rails frontend stack entirely. The closest comparison is Rails API-only mode: controllers answer JSON, and the frontend is a separate app.

There is no view layer, no asset pipeline, no Hotwire, no session store, and no CSRF middleware. The framework provides the HTTP authentication handshake, not a user model. The app owns the credential model and session design. With coding agents, maintaining a frontend as a separate stack is practical, and the JSON API gives both sides a clear interface. The frontend can live in the same repository or its own; the backend does not choose React, a native app, or a server-rendered page.

## Build-time code generation

Rails removes boilerplate by handling it at runtime. Zeitwerk autoloads constants from `app/`, Active Record reads the schema and defines column methods, and the route set defines path helpers. All three are runtime conveniences: the app does not declare the boilerplate, and the framework creates it while the app runs.

Snails keeps the convenience without runtime metaprogramming. It does not autoload, define model methods from the schema at boot, or build route helpers from the route table at runtime. The compiler needs a static require graph, and the app needs generated code a human can review. The CLI generates the code before every build: `gen/` holds the literal require lists for each app folder, `gen/model_columns.rb` holds the column readers and type lists from `db/schema.sql`, and `gen/route_helpers.rb` holds the path methods from `config/routes.rb`. The agent adds files under `app/` and route declarations; the next `bin/dev` or `bin/test` refreshes the generated files.

The schema is the input. A `posts` table with `title` and `status` produces readers on `Post`:

```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
);
```

```ruby
# gen/model_columns.rb (generated)
module GeneratedModelReaders
  module Post
    def title = read_attribute(:title)
    def status = read_attribute(:status)
  end
end
```

The generated file also carries `COLUMNS` and the type lists used for conversion. The model file names its table; it does not declare those readers. The next section shows the model code that uses them.

## Models over SQL

Coding agents write SQL well; an ORM's abstraction does not help that work. The framework needs a standard API for the common reads and writes. Without one, every model grows its own helpers and the code becomes inconsistent. `Sqlx` is that standard API, not a domain model. It keeps the common path the same across models: the agent calls the same methods, and the human reads the SQL and the bound values.

A model names its table. The columns come from the schema and the generated readers, and the inherited reads and writes operate on the table. There are no associations, callbacks, or model validations. Validation belongs to form objects, and the schema constraint is the model layer's last line. The common reads and writes use a focused set of methods with parameterized values; joins, views, and aggregates use raw SQL.

```ruby
class Post < Sqlx::Base
  def self.table_name = "posts"
end

post = Post.find_by({ title: "Hello" })
post.title
post.status
Post.update!(post.id, { status: "published" })
Post.fetch_many({ status: "draft" }, order: :desc)
```

The model layer is thin on purpose: the SQL is the source, and the framework gives the common queries a standard API. A join or a cascade is written as a query where a human can read it. An empty condition is refused unless the caller explicitly asks for an ordered whole-table read. Writes raise when the database rejects them.

## Migrations are SQL

The migration is SQL because the agent writes the statements the human reads. There is no Ruby DSL to translate, and a human does not need to hand-write the file. The schema dump comes from the same files; the migration and the generated column readers share one source.

A schema change is a numbered SQL file under `db/migrate/`. `snails migrate apply` runs the pending files in order, and `snails migrate dump` regenerates `db/schema.sql`. `snails migrate verify` checks the dump against a replay, and `snails migrate check` stops a deploy while anything is pending. If another system owns the schema, `DB_OWNER="external"` tells the CLI to refuse DDL.

A later change adds a stable URL segment and backfills existing rows:

```sql
-- Add a stable URL segment and backfill existing posts.
ALTER TABLE posts ADD COLUMN slug TEXT;
UPDATE posts SET slug = 'post-' || CAST(id AS TEXT) WHERE slug IS NULL;
CREATE UNIQUE INDEX posts_slug_key ON posts (slug);
```

The statements are the change: a column, a backfill, and a uniqueness constraint. A human reviews them in the file the agent applies; the next `snails migrate dump` feeds the generated column readers from the same source.

## Performance first

Rails is often criticized for its performance. Ruby's global VM lock (GVL) limits one process to one thread of application code. Rails runs worker processes to use more cores; each worker carries its own VM, connection pool, heap, and resident set.

Snails makes a major architectural choice: no Ruby runtime, no gem compatibility, and one native binary that contains the app, the framework, and the HTTP server. App code stays Ruby; the compiler turns it into the binary. That removes the GVL, the Bundler load path, and the per-worker memory footprint. One process runs request handlers on the cores the OS gives it, and the binary boots in single-digit milliseconds. The [Performance](/manual/performance/) chapter measures about 3× the throughput of Rails in cluster mode, 10× or more peak-memory savings under load, and about 12× the throughput of a default Rails app.

The no-gem choice is what coding agents make practical. A gem assumes a Ruby runtime and a Bundler load path; the binary has none. The framework provides the helpers an API app needs, and the app provides the rest; the agent implements the missing behavior in the app, in the same language and test suite. That is why the performance choice is practical now.

<a id="integration-tests-against-a-real-server"></a>

## Integration by default

Stubs and mocks are easier to write; an agent choosing on its own will often produce a suite that describes the system instead of exercising it. The harness makes integration the default: `bin/test` builds the app, boots it on a spare port, and sends real HTTP requests. One fresh server serves the suite; each case resets the tables it declares.

The test code follows the Rails integration-test pattern:

```ruby
# harness/test/posts_test.rb
require_relative "../boot"

class PostsTest < Snails::Harness::IntegrationTest
  def tables = ["posts"]

  test "creating a post stores the row" do
    post("/posts", params: { "title" => "Hello" }, as: :json)
    assert_response(:success)
    assert_equal "Hello", Post.find_by({ title: "Hello" }).title
  end
end
```

The `post` call sends a real HTTP request. `assert_response` checks the real status, and `Post.find_by` reads the row the request wrote. The test does not stub or mock the framework. The default path is the real HTTP server; a passing suite exercises the app as it runs.

## A note on why I built Snails

I built Snails because I like Ruby and Rails. I do not want them to be treated as a dying language and framework in the agent era. Ruby and Rails are developer-friendly for a reason: the conventions, the API style, the way a team can build a real product. Those strengths do not disappear when coding agents write more of the code. What changes is the runtime overhead of the abstractions that were added for human writing.

Snails keeps those strengths and removes the runtime overhead. The design is working when the human can decide from the route, the SQL, the migration, and the test evidence. The agent can add code; the review stays a decision, not an audit. That is the abstraction trade: keep what makes Ruby and Rails good, remove what makes them slow.

That is the only reason I built Snails. I want Ruby and Rails to keep being useful in the agent era, and I want Snails to be one way to do that.

## For Ruby and Rails developers

I built a working framework, not a prototype. I have migrated an existing Rails app and run new apps in production. The [benchmark](https://github.com/snails-rb/snails-benchmark) shows about 3× the throughput of Rails in cluster mode and 10× or more peak-memory savings under load. Those are benchmark numbers; the [field report](/blog/why-i-didnt-rewrite-my-rails-app-in-rust/) measures the production node at steady state. In production, the migrated app runs the full application on a 1 GB node. 512 MB is the next target, not yet verified. The base design is validated in use. 1.0 was the first stable release; the project is on 1.x now. 2.0 and 3.0 will keep the same conventions.

The next question is whether it fits the way other Ruby and Rails developers work. I would like to hear from Ruby and Rails developers: what you would try, what you would change, and what is missing. Interest, feedback, and ideas are the next step. The source is open, and the discussion is open. Open a [discussion](https://github.com/snails-rb/snails/discussions) or send an [issue](https://github.com/snails-rb/snails/issues) with the Rails convention you would miss.

## Further reading

- [Welcome to Snails](/manual/welcome-to-snails/)
- [Coming from Rails](/manual/coming-from-rails/)
- [Database and Models](/manual/database-and-models/)
- [Migrations](/manual/migrations/)
- [Testing](/manual/testing/)
- [Concurrency](/manual/concurrency/)
- [Performance](/manual/performance/)
- [Why I didn't rewrite my Rails app in Rust](/blog/why-i-didnt-rewrite-my-rails-app-in-rust/) — a field report on one app's version of this trade.
- [Snails benchmark](https://github.com/snails-rb/snails-benchmark)
- [Spinel](https://github.com/matz/spinel)
- [Rails 7 release notes](https://rubyonrails.org/2021/12/15/Rails-7-fulfilling-a-vision)
