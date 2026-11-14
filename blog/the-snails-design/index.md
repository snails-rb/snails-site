---
title: The Snails Design
description: The design choices behind Snails, and the Rails abstraction trade they change.
date: 2026-11-13
author: Snails
---

Snails is a Rails-like framework for API-only Ruby apps. It keeps the Rails conventions that make an API app predictable — routes, controllers, form objects, mailers, jobs, and a conventional folder layout — and compiles the app, the framework, and the HTTP server into one native executable. The design keeps the developer-friendly Rails conventions and removes the abstractions that were chosen for human writing and added runtime overhead.

## Rails' abstraction trade

Rails is developer-friendly because it abstracts work a human would otherwise do: ActiveRecord hides SQL, the view layer and asset pipeline hide the browser stack, and gems supply behavior a team would otherwise build. Those abstractions made a human team faster, and Rails accepted the runtime overhead: a Ruby runtime, a GVL, worker processes, and layers between the request and the database.

Coding agents change the calculation. They write SQL, maintain a backend and a frontend as two stacks, and implement a small missing behavior instead of adding a dependency. The abstractions that saved a human team time now add layers an agent does not need and a reviewer has to trust. Snails keeps the Rails conventions and the developer-friendly API style, and removes the layers that add runtime overhead: no ORM, no view layer, no gem compatibility, one native binary. The developer-friendly conventions no longer have to carry that overhead.

A common argument now is that abstraction is over. The claim is too broad. The narrower claim is that the abstractions Rails chose for human writing no longer earn their runtime overhead when agents write the code. Abstraction is still necessary, but it must be light and shared: conventions and rules the agent follows and the reviewer checks. The agent produces predictable code; the reviewer checks the route, the SQL, the migration, and the test evidence, and decides what ships. Review is the constraint, not the reason for the design. The reason is the abstraction trade: keep what makes Rails pleasant to use, remove what makes it slow.

## Predictable Rails conventions

The point of the Rails conventions is predictability: an agent can add code without inventing a layout, and a reviewer knows where to look. Routes live in `config/routes.rb`, controllers are classes with actions, forms own validation, mailers and jobs have their own folders, and migrations are numbered files. A new endpoint has one obvious place, and a reviewer can find the request path without a map. The [Coming from Rails](/manual/coming-from-rails/) chapter is the translation table for the habits that carry over and the ones that do not.

## The API is the product

The API is the product: the frontend is a separate choice. Rails 7 made Hotwire (Turbo and Stimulus) the default frontend for new apps, and that stack grew out of Basecamp's server-rendered product. With coding agents, a backend and a frontend are two stacks an agent can maintain, and the JSON API gives both sides a clear interface. Snails keeps the backend at that JSON API. It has no HTML views, no asset pipeline, and no Hotwire. Controllers answer JSON, a redirect, or a status. The frontend can live in the same repository or its own; the JSON API is the interface between them. The backend does not choose React, a native app, or a server-rendered page.

The framework has no session store. The frontend owns rendering; the app owns its credential model and session design. The framework provides the HTTP authentication handshake, not a user model.

## Models over SQL

Coding agents write SQL well; an ORM's abstraction adds little for them. They need a standard API for the common reads and writes. Without one, every model grows its own helpers and the code becomes inconsistent. `Sqlx` is that standard API, not a domain model. It keeps the common path the same across models: the agent calls the same methods, and the reviewer reads the SQL and the bound values.

A model names its table. The columns come from the schema, and the inherited reads and writes operate on the table. There are no associations, callbacks, or model validations. Validation belongs to form objects, and the schema constraint is the model layer's last line. The common reads and writes use a small set of methods with parameterized values; joins, views, and aggregates use raw SQL.

```ruby
class Comment < Sqlx::Base
  def self.table_name = "comments"
end

Comment.fetch_many({ post_id: post.id }, order: :asc)
```

The model layer is small on purpose: the SQL is the source, and the framework gives the common queries a standard API. A join or a cascade is written as a query where the reviewer can read it. An empty condition is refused unless the caller explicitly asks for an ordered whole-table read. Writes raise when the database rejects them.

## Migrations are SQL

The migration is SQL because the agent writes the statement the reviewer reads. There is no Ruby DSL to translate, and a human does not need to hand-write the file. The schema dump comes from the same files; the migration and the generated column readers share one source.

A schema change is a numbered SQL file under `db/migrate/`. `snails migrate apply` runs the pending files in order, and `snails migrate dump` regenerates `db/schema.sql`. `snails migrate verify` checks the dump against a replay, and `snails migrate check` stops a deploy while anything is pending. If another system owns the schema, `DB_OWNER="external"` tells the CLI to refuse DDL.

```sql
-- Slugs give posts a stable URL segment.
ALTER TABLE posts ADD COLUMN slug TEXT;
```

## Performance first

Rails is often criticized for its performance. Ruby's global VM lock (GVL) limits one process to one thread of application code. Rails runs worker processes to use more cores; each worker carries its own VM, connection pool, heap, and resident set.

Snails makes a major architectural choice: no Ruby runtime, no gem compatibility, and one native binary that contains the app, the framework, and the HTTP server. App code stays Ruby; the compiler turns it into the binary. That removes the GVL, the Bundler load path, and the per-worker memory footprint. One process runs request handlers on the cores the OS gives it, and the binary boots in single-digit milliseconds. The [Performance](/manual/performance/) chapter measures about 3× the throughput of Rails in cluster mode, 10× or more peak-memory savings under load, and about 12× the throughput of a default Rails app.

The no-gem choice is what coding agents make practical. A gem assumes a Ruby runtime and a Bundler load path; the binary has none. The framework provides the helpers an API app needs, and the app provides the rest; the agent implements the small missing behavior in the app, in the same language and test suite. That is why the performance choice is practical now.

## Integration tests against a real server

Stubs and mocks are easier to write; an agent left to choose will often produce a suite that describes the system instead of exercising it. The harness makes integration the default: `bin/test` builds the app, boots it on a spare port, and sends real HTTP requests through the harness. One fresh server serves the suite; each case resets the tables it declares. Nothing mocks the framework out of the way. A passing suite exercises the app.

## The resulting design

The choices reinforce each other. A small model API keeps the SQL visible. A native binary removes the Ruby runtime between the app and the request. A real-server harness exercises the HTTP path. The result is a framework that keeps the developer-friendly conventions without the heavy abstraction: the agent writes inside a small, standard API; the reviewer checks the route, the SQL, the migration, and the test evidence; the binary and the harness make that evidence real. The framework's job is to keep that review small and honest.

Snails is for API-only apps whose API is the product, whose deployment is one binary, and whose team wants the SQL and the request path visible. It keeps the Rails conventions and removes the runtime overhead that came with the Rails default. Coding agents write the implementation; humans review the decisions and decide what ships. An app that needs server-rendered pages, the full Ruby gem ecosystem, or Active Record's object model is better served by Rails.

## Further reading

- [Welcome to Snails](/manual/welcome-to-snails/)
- [Coming from Rails](/manual/coming-from-rails/)
- [Database and Models](/manual/database-and-models/)
- [Migrations](/manual/migrations/)
- [Testing](/manual/testing/)
- [Concurrency](/manual/concurrency/)
- [Performance](/manual/performance/)
- [Snails benchmark](https://github.com/snails-rb/snails-benchmark)
- [Spinel](https://github.com/matz/spinel)
- [Rails 7 release notes](https://rubyonrails.org/2021/12/15/Rails-7-fulfilling-a-vision)
