---
title: The Snails Design
description: The design choices behind Snails — Rails conventions without the runtime overhead.
date: 2026-11-13
updated: 2026-11-24
author: Snails
---

Snails is a Rails-like framework for API-only Ruby apps. It keeps the Rails conventions that make an API app predictable — routes, controllers, forms, mailers, jobs, tests, and a conventional folder layout — drops the Ruby runtime, and compiles the app, the framework, and the HTTP server into one native binary with [Spinel](https://github.com/matz/spinel). The design targets native performance and a lower memory footprint.

## Rails' abstraction trade-off

Rails is productive because it abstracts work a developer would otherwise do: Active Record hides SQL, the view layer hides HTML rendering, the asset pipeline hides the browser-side build, and gems supply behavior a team would otherwise build. Those abstractions made a team faster, and Rails accepted the runtime overhead: a Ruby runtime, a GVL, worker processes, and layers between the request and the database.

Coding agents change that trade-off. They write SQL, maintain a backend and a frontend as two stacks, and implement the missing behavior instead of adding a dependency. The abstractions that saved a team time now add layers an agent does not need and the developer has to trust. Snails keeps the Rails conventions and the developer-friendly API style, and removes the layers that add runtime overhead: no Active Record, no view layer, no gems, one native binary.

A common argument now is that abstraction is over. The claim is too broad. The more specific claim is that the abstractions Rails chose for human writing no longer justify their runtime overhead when agents write the code. Abstraction is still necessary, but it must be thin and shared: thin enough to read, and shared as the conventions and rules the agent follows and the developer checks. The agent writes predictable code; the developer checks the route, the SQL, the migration, and the test evidence, and decides what ships. Review is the constraint on the design, not its justification. The reason is the trade-off: keep what makes Rails productive, remove what makes it slow.

## Predictable Rails conventions

The point of the Rails conventions is predictability: an agent can add code without inventing a layout, and the developer knows where to look. Routes live in `config/routes.rb`, controllers are classes with actions, mailers, jobs, and tests have their own folders, and migrations are numbered files. Validation moves to forms. A new endpoint has one obvious place, and the developer can find the request path without a map. The [Coming from Rails](/manual/coming-from-rails/) chapter is the translation table for the habits that carry over and the ones that do not.

## The frontend is a separate app

Rails 7 made Hotwire (Turbo and Stimulus) the default frontend for new apps. That stack is part of Rails' server-rendered default. Snails removes the Rails frontend stack entirely. The closest comparison is Rails API-only mode: controllers answer JSON, and the frontend is a separate app.

There is no view layer, no asset pipeline, no Hotwire, no session store, and no CSRF middleware. With coding agents, a separate frontend is practical: an agent can generate hurl scenarios from the routes in a few minutes, and the JSON API gives both sides a clear interface. The frontend can live in the same repository or its own. The framework does not care whether the frontend is a SPA, a native app, or server-rendered HTML.

## Build-time code generation

Rails removes boilerplate by handling it at runtime. Zeitwerk autoloads constants from `app/`, Active Record reads the schema and defines column methods, and the router defines path helpers. All three are runtime conveniences: the app does not declare the boilerplate, and the framework creates it while the app runs.

Snails builds the framework in plain Ruby, without runtime metaprogramming. It does not autoload, define model methods from the schema at boot, or build route helpers from the route table. Spinel can only compile what it can resolve at build time. The app must give Spinel a static require graph, and the code Rails would generate at runtime must exist before the build. The CLI generates that code before every build: `gen/` holds the literal require lists for each app folder, `gen/model_columns.rb` holds the column readers and type lists from `db/schema.sql`, and `gen/route_helpers.rb` holds the path helpers from `config/routes.rb`.

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

The generated file also carries `COLUMNS` and the type lists used for conversion. The model file names its table; it does not declare those readers.

## Models over SQL

Coding agents write SQL well; an ORM is the wrong abstraction for that work. The framework needs a thin SQL layer for the common reads and writes. Without one, every model grows its own helpers and the code loses consistency. `Sqlx` is that thin SQL layer, not a domain model. It keeps the common path the same across models: the agent calls the same methods, and the developer reads the SQL and the bound values.

A model names its table. The columns come from the schema and the generated readers, and the inherited reads and writes operate on the table. There are no associations, callbacks, or model validations. Validation moves to forms: the form validates input, and the model writes the row; the database constraint is the last line. The common reads and writes use a focused set of methods with bound values; queries that need joins or grouping are raw SQL.

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

The code is more explicit and predictable, but there is more code.

## Migrations are SQL

The migration is SQL because the agent writes the statements the developer reads. There is no Ruby DSL to translate, and the developer does not need to hand-write the file. The schema dump is generated from the migrations, and the column readers are generated from the dump.

A schema change is a numbered SQL file under `db/migrate/`. `snails migrate apply` runs the pending files in order, and `snails migrate dump` regenerates `db/schema.sql`. `snails migrate verify` checks the dump against a replay, and `snails migrate check` blocks a deploy if anything is pending. If another system owns the schema, `DB_OWNER="external"` tells the CLI to refuse DDL.

A later change adds a URL slug and backfills existing rows:

```sql
-- Add a URL slug and backfill existing posts.
ALTER TABLE posts ADD COLUMN slug TEXT;
UPDATE posts SET slug = 'post-' || CAST(id AS TEXT) WHERE slug IS NULL;
CREATE UNIQUE INDEX posts_slug_key ON posts (slug);
```

The statements are the change: a column, a backfill, and a unique index. The developer checks them in the file the agent applies; the next `snails migrate dump` regenerates `db/schema.sql`, which the column readers come from.

## Performance first

Rails is often criticized for its performance. Ruby's global VM lock (GVL) limits one process to one thread of application code. Rails runs worker processes to use more cores; each worker carries its own VM, connection pool, heap, and resident set. A rewrite in another language would solve the memory problem, but it would lose the Ruby source and the Rails conventions.

Snails makes a major architectural choice: no Ruby runtime, no gems, and one native binary that contains the app, the framework, and the HTTP server. App code stays Ruby; the compiler turns it into the binary. One process, multi-threaded, across all cores: no worker processes, no GVL. The binary boots in single-digit milliseconds. The [Performance](/manual/performance/) chapter measures about 3× the requests per second of Rails in cluster mode, with more than 10× lower peak memory under load.

Coding agents make the no-gem choice practical. A gem assumes a Ruby runtime and a Bundler load path; the binary has none. The framework provides the helpers an API app needs, and the app provides the rest; the agent implements the missing behavior in the app, in the same language, with the same tests. That is why the performance argument works now.

<a id="integration-tests-against-a-real-server"></a>

## Integration by default

Stubs and mocks are easier to write; an agent choosing on its own will often produce a suite that asserts on the framework instead of exercising the app. The harness makes integration the default: `bin/test` builds the app, boots it on a spare port, and sends real HTTP requests. One fresh server handles the whole suite; each case resets the tables it declares.

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

The `post` call sends a real HTTP request. `assert_response` checks the real status, and `Post.find_by` reads the row the request wrote. The test does not stub or mock the framework. The default is a live HTTP server; a passing suite exercises the app the way it runs in production.

## Why Snails

Snails exists to make one combination work: a native Rails-like Ruby app with a lower memory footprint. Those three claims set three constraints. A native Ruby app can't carry the Rails stack in its source: Active Record defines methods, the router builds helpers, and gems load their code at runtime, while Spinel can only compile what it can resolve at build time. A Rails-like Ruby app rules out a rewrite in another language: the source stays Ruby. A lower memory footprint rules out the full stack: the Rails layers are the memory cost. Put all three together, and the Rails stack has to go. Snails is that design.

Snails keeps the Rails conventions an API needs and builds the framework in plain Ruby. The app, framework, and HTTP server compile into one native binary. Routes, controllers, forms, mailers, jobs, and tests still follow the Rails conventions. The cost is the model layer: no Active Record, no gems. Reads and writes go through a thin SQL layer, validation moves to forms, and queries that need joins or grouping are raw SQL. The code is more explicit and predictable, but there is more code. That is the trade-off.

## Further reading

- [Welcome to Snails](/manual/welcome-to-snails/)
- [Coming from Rails](/manual/coming-from-rails/)
- [Database and Models](/manual/database-and-models/)
- [Migrations](/manual/migrations/)
- [Testing](/manual/testing/)
- [Concurrency](/manual/concurrency/)
- [Performance](/manual/performance/)
- [A native Rails-like Ruby app using 20 MB of memory](/blog/a-native-rails-like-ruby-app-using-20-mb-of-memory/)
- [Snails benchmark](https://github.com/snails-rb/snails-benchmark)
- [Spinel](https://github.com/matz/spinel)
- [Rails 7 release notes](https://rubyonrails.org/2021/12/15/Rails-7-fulfilling-a-vision)
