---
title: The Snails Design
description: The design choices behind Snails, and the purpose each one serves.
date: 2026-11-13
author: Snails
---

Snails is a Rails-like framework for API-only Ruby apps. It keeps the conventions that make an API app predictable — routes, controllers, form objects, mailers, jobs, and a conventional folder layout — and gives the framework a small surface and a different runtime. This is not a list of features missing from Rails. It is a set of design choices, each made for a reason.

The choices share one goal: an API-only app that compiles to one native binary, keeps the SQL and the request path visible, and makes the integration boundary the default test boundary. The design is opinionated, but it is not arbitrary. Every choice below follows from that goal.

The design also assumes that tests and review remain part of the work, and that coding agents do much of the implementation. The point is not to remove review. It is to keep the common path small enough to read and to make the path you want reviewed the default.

## The Rails conventions Snails keeps

Routes live in `config/routes.rb`, controllers are classes with actions, forms own validation, mailers and jobs have their own folders, and migrations are numbered files. A new endpoint has a predictable place, and a reviewer can find the request path without a map. The [Coming from Rails](/manual/coming-from-rails/) chapter is the translation table for the habits that carry over and the ones that do not.

## The API is the product

Snails has no HTML views, no asset pipeline, and no Hotwire. Controllers answer JSON, a redirect, or a status. The frontend can live in the same repository or its own; the JSON boundary is the contract between them.

Rails 7 made Hotwire (Turbo and Stimulus) the default frontend, and that stack grew out of Basecamp's server-rendered product. Snails keeps the backend at the JSON boundary, so the frontend is a separate design decision. The backend does not choose React, a native app, or a server-rendered page for you.

The framework does not include a view layer or a CSRF/session stack. Those belong to the frontend and to the application's own session and auth design. The JSON boundary is the contract, and it stays explicit.

## The model layer keeps SQL visible

A model names its table. The columns come from the schema, and the inherited reads and writes operate on the table. There are no associations, callbacks, or model validations. Validation belongs to form objects, and the schema constraint is the model layer's last line. The common reads and writes use a small query surface with parameterized values; joins, views, and aggregates use raw SQL.

```ruby
class Comment < Sqlx::Base
  def self.table_name = "comments"
end

Comment.fetch_many({ post_id: post.id }, order: :asc)
```

Agents can write SQL, but the point is not to remove the model layer. The small surface keeps the common path consistent and the boilerplate out of every model, so a reviewer can see the SQL and the bound values. Empty conditions are refused instead of matching every row, and writes raise when the database rejects them.

The model layer is small on purpose: the SQL is the source, and the framework gives the common queries a standard API. A join or a cascade is written as a query where the reviewer can read it.

## Migrations are SQL

A schema change is a numbered SQL file under `db/migrate/`. `snails migrate apply` runs the pending files in order, and `snails migrate dump` regenerates `db/schema.sql`. `snails migrate verify` checks the dump against a replay, and `snails migrate check` stops a deploy while anything is pending. If another system owns the schema, `DB_OWNER="external"` tells the CLI to refuse DDL.

```sql
-- Slugs give posts a stable URL segment.
ALTER TABLE posts ADD COLUMN slug TEXT;
```

The change itself is SQL. A reviewer reads the statement without translating a Ruby DSL, and an agent writes the file that will be applied. The schema dump comes from the same files, so the migration and the generated column readers share one source.

## One binary, one runtime

The app builds into one executable that includes the framework and the HTTP server. App code stays Ruby; the compiler turns it into the binary. The CLI is bash, so neither the command line nor the server needs a Ruby installation. The machine that runs the binary does not need Ruby, Bundler, or a separate application server. One process serves requests on the available cores without a worker process per core, and memory does not multiply with a worker count.

Snails 1.0 runs one server process. `WORKERS` and `-w` are accepted but do not add processes; run more copies or containers when one process is not enough.

The runtime is self-contained. There is no Ruby runtime and no Bundler load path, so the framework provides the helpers an API app needs and the app provides the rest. When an app needs a small feature, it is written in the app, in the same language and the same test suite. The dependency surface stays small, and the deployment is one artifact.

## Tests cross the HTTP boundary

`bin/test` builds the app, boots it on a spare port, and sends real HTTP requests through the harness. One fresh server serves the suite; each case resets the tables it declares. Nothing mocks the framework out of the way.

The harness makes integration the default. Stubs and mocks are easier to write, so an agent left to choose will often produce a suite that describes the system instead of exercising it. The real server makes the suite send requests through the same HTTP server the app uses.

## Why these choices fit together

The choices reinforce each other. A small model surface keeps the SQL visible. A single binary removes the runtime that would sit between the app and the request. A real-server harness exercises the HTTP path. The result is a framework with a small surface, one deployment artifact, and a test suite that exercises the app rather than a description of it.

Snails is for API-only apps whose API is the product, whose deployment is one binary, and whose team wants the SQL and the request path visible. That is the design. The [manual](/manual/welcome-to-snails/) covers the details.

## Further reading

- [Welcome to Snails](/manual/welcome-to-snails/)
- [Coming from Rails](/manual/coming-from-rails/)
- [Database and Models](/manual/database-and-models/)
- [Migrations](/manual/migrations/)
- [Testing](/manual/testing/)
- [Performance](/manual/performance/)
- [Snails benchmark](https://github.com/snails-rb/snails-benchmark)
- [Spinel](https://github.com/matz/spinel)
- [Rails 7 release notes](https://rubyonrails.org/2021/12/15/Rails-7-fulfilling-a-vision)
