---
title: The Snails Design
description: The design choices behind Snails, and the workflow they serve.
date: 2026-11-13
author: Snails
---

Snails is a Rails-like framework for API-only Ruby apps. It keeps the Rails conventions that make an API app predictable — routes, controllers, form objects, mailers, jobs, and a conventional folder layout — and gives the framework a small API and a different runtime. This is not a list of features missing from Rails. It is a set of design choices, each made for a reason.

The design assumes coding agents write the implementation and humans review the code and decide what ships. That is the starting point, not a side note. The choices below follow from that workflow: keep the code small enough for a reviewer to read, keep the SQL visible, and make the default path the one a reviewer needs to check.

## The workflow this design assumes

A single server-rendered stack, an ORM, and the Ruby gem ecosystem made sense when a human team wrote every line. One stack meant one codebase. An ORM saved the team from writing common queries, and gems supplied behavior the team did not want to build. Coding agents change those reasons. They write SQL well, maintain a backend and a frontend as two stacks, and implement a small missing behavior instead of adding a dependency. Snails is built for that change.

The framework does not remove review. It makes review the point. The agent writes the code; the reviewer checks the route, the SQL, the migration, and the test evidence, and decides what ships. The rest of this article explains how each choice serves that workflow.

## The Rails conventions are predictable for agents and reviewers

Routes live in `config/routes.rb`, controllers are classes with actions, forms own validation, mailers and jobs have their own folders, and migrations are numbered files. A new endpoint has one obvious place, and a reviewer can find the request path without a map. The conventions are predictable for both an agent and a reviewer: the agent can add code without inventing a layout, and the reviewer knows where to look. The [Coming from Rails](/manual/coming-from-rails/) chapter is the translation table for the habits that carry over and the ones that do not.

## The API is the product

Snails has no HTML views, no asset pipeline, and no Hotwire. Controllers answer JSON, a redirect, or a status. The frontend can live in the same repository or its own; the JSON API is the interface between them.

Rails 7 made Hotwire (Turbo and Stimulus) the default frontend for new apps, and that stack grew out of Basecamp's server-rendered product. With coding agents, a backend and a frontend are two stacks an agent can maintain, and the JSON API gives both sides a clear interface. The backend does not choose React, a native app, or a server-rendered page for you.

The framework has no session store. The frontend owns rendering; the app owns its credential model and session design. The framework provides the HTTP authentication handshake, not a user model.

## The model layer is a standard API over SQL

A model names its table. The columns come from the schema, and the inherited reads and writes operate on the table. There are no associations, callbacks, or model validations. Validation belongs to form objects, and the schema constraint is the model layer's last line. The common reads and writes use a small set of methods with parameterized values; joins, views, and aggregates use raw SQL.

```ruby
class Comment < Sqlx::Base
  def self.table_name = "comments"
end

Comment.fetch_many({ post_id: post.id }, order: :asc)
```

Coding agents write SQL well, so an ORM's abstraction adds little for them. What they need is a standard API for the common reads and writes; without one, every model grows its own helpers and the code becomes inconsistent. `Sqlx` is that standard API, not a domain model. It keeps the common path the same across models, so the agent calls the same methods and the reviewer reads the SQL and the bound values.

The model layer is small on purpose: the SQL is the source, and the framework gives the common queries a standard API. A join or a cascade is written as a query where the reviewer can read it. An empty condition is refused unless the caller explicitly asks for an ordered whole-table read. Writes raise when the database rejects them.

## Migrations are SQL

A schema change is a numbered SQL file under `db/migrate/`. `snails migrate apply` runs the pending files in order, and `snails migrate dump` regenerates `db/schema.sql`. `snails migrate verify` checks the dump against a replay, and `snails migrate check` stops a deploy while anything is pending. If another system owns the schema, `DB_OWNER="external"` tells the CLI to refuse DDL.

```sql
-- Slugs give posts a stable URL segment.
ALTER TABLE posts ADD COLUMN slug TEXT;
```

The migration is SQL because the agent writes the statement the reviewer reads. There is no Ruby DSL to translate, and a human does not need to hand-write the file. The schema dump comes from the same files, so the migration and the generated column readers share one source.

## Performance is a key design choice

Rails is often criticized for its performance. Ruby's global VM lock (GVL) limits one process to one thread of application code, so Rails runs worker processes to use more cores; each worker carries its own VM, connection pool, heap, and resident set.

Snails makes a major architectural choice: no Ruby runtime, no gem compatibility, and one native binary that contains the app, the framework, and the HTTP server. App code stays Ruby; the compiler turns it into the binary. That removes the GVL, the Bundler load path, and the per-worker memory footprint. One process runs request handlers on the cores the OS gives it, and the binary boots in single-digit milliseconds. The [Performance](/manual/performance/) chapter measures about 3× the throughput of Rails in cluster mode, 10× or more peak-memory savings under load, and about 12× the throughput of a default Rails app.

The no-gem choice is what coding agents make practical. A gem assumes a Ruby runtime and a Bundler load path; the binary has none. The framework provides the helpers an API app needs, and the app provides the rest; the agent implements the small missing behavior in the app, in the same language and test suite. That is why the performance choice is practical now.

## Tests run against the real server

`bin/test` builds the app, boots it on a spare port, and sends real HTTP requests through the harness. One fresh server serves the suite; each case resets the tables it declares. Nothing mocks the framework out of the way.

The harness makes integration the default. Stubs and mocks are easier to write, so an agent left to choose will often produce a suite that describes the system instead of exercising it. The real server makes the default test send real HTTP requests, so a passing suite exercises the app.

## The workflow these choices serve

The choices reinforce each other. A small model API keeps the SQL visible. A native binary removes the Ruby runtime between the app and the request. A real-server harness exercises the HTTP path. The result is a workflow: the agent writes inside a small, standard API; the reviewer reads the route, the SQL, the migration, and the test evidence; the binary and the harness make that evidence real. The framework's job is to keep that workflow small and honest.

Snails is for API-only apps whose API is the product, whose deployment is one binary, and whose team wants the SQL and the request path visible. The design assumes coding agents write the implementation and humans review and decide; that is the workflow it optimizes for. If you need server-rendered pages, the full Ruby gem ecosystem, or Active Record's object model, Rails is the better fit.

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
