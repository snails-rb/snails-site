---
title: Why Snails
description: The six design choices behind Snails, and what each one costs.
date: 2026-11-13
author: Snails
---

Snails is a small Rails for API-only apps. It keeps the conventions that make an API readable — routes, controllers, form objects, mailers, jobs, and a conventional folder layout — and leaves out the layers that assume a server-rendered monolith, a Ruby runtime, or a full ORM. This post explains six choices behind that boundary and what each one costs. The [manual](/manual/welcome-to-snails/) is the current reference for behavior.

The design assumes that tests and review stay in the loop, and that coding agents do much of the implementation. That is not a claim that agents replace reviewers. It is a reason to keep the common path small enough to read and to make the default path the one you want reviewed. Snails is not a Rails replacement. If you need server-rendered pages, the Ruby gem ecosystem, or Active Record's object model, Rails is the better fit.

## The Rails shape that stays

Routes live in `config/routes.rb`, controllers are classes with actions, forms own validation, mailers and jobs have their own folders, and migrations are numbered files. A new endpoint has a predictable place, and a reviewer can find the request path without a map. The [Coming from Rails](/manual/coming-from-rails/) chapter is the translation table for the habits that carry over and the ones that do not.

## No views, no asset pipeline

Snails has no HTML views, no asset pipeline, and no Hotwire. Controllers answer JSON, a redirect, or a status. The frontend can live in the same repository or its own; the JSON boundary is the contract between them.

Rails 7 made Hotwire (Turbo and Stimulus) the default frontend, and that stack grew out of Basecamp's server-rendered product. A backend that stops at JSON leaves the frontend as a deliberate choice instead of a default inherited from the server.

The cost is the integrated server-rendered workflow. There are no view helpers, CSRF middleware, or session store; request cookies are parsed, but the framework does not manage sessions. A separate frontend also means a second deployable to operate. If server-rendered pages are the product, another framework is the better fit.

## No Active Record

A model names its table. The columns come from the schema, and the inherited reads and writes operate on the table. There are no associations, callbacks, or model validations. Validation belongs to form objects, and the schema constraint is the model layer's last line. The common reads and writes use a small query surface with parameterized values; joins, views, and aggregates use raw SQL.

```ruby
class Comment < Sqlx::Base
  def self.table_name = "comments"
end

Comment.fetch_many({ post_id: post.id }, order: :asc)
```

Agents can write SQL, but the point is not to remove the model layer. The small surface keeps the common path in one shape and the boilerplate out of every model, so a reviewer can see the SQL and the bound values. Empty conditions are refused instead of matching every row, and writes raise when the database rejects them.

The cost is the object model: no lazy loading, no association graph, no callback chain. Joins and cascades are explicit code, and a complex domain will need more of it than it would under Active Record. If you want one object model over the database, Rails is the better fit.

## Gem compatibility

The app, the framework, and the HTTP server compile into one native executable. App code stays Ruby, and the server does not need a Ruby runtime. The CLI is bash as well, so neither the command line nor the server carries a Ruby installation.

The clearest cost is the Ruby gem ecosystem. A gem that expects a Ruby runtime, a Bundler load path, or a native extension has no place in the build. When an app needs a small, well-understood behavior, writing it in the app can be cheaper than carrying a dependency that no longer fits, but the app owns that code, its tests, and its security updates. Not every gem is replaceable.

## SQL migrations

A schema change is a numbered SQL file under `db/migrate/`. `snails migrate apply` runs the pending files in order, and `snails migrate dump` regenerates `db/schema.sql`. `snails migrate verify` checks the dump against a replay, and `snails migrate check` stops a deploy while anything is pending. If another system owns the schema, `DB_OWNER="external"` tells the CLI to refuse DDL.

```sql
-- Slugs give posts a stable URL segment.
ALTER TABLE posts ADD COLUMN slug TEXT;
```

The change stays readable as SQL. A reviewer can read the statement without translating a Ruby DSL, and an agent can write the file it will apply.

The cost is the Rails migration DSL and its conveniences. There is no generated model definition from the migration file; the schema stays the source for the generated column readers, and the dump must be regenerated after every change.

## One native binary

The app builds into one executable that includes the framework and the HTTP server. The machine that runs it does not need Ruby, Bundler, or a separate application server. One process serves requests on the available cores without a worker process per core, and memory does not multiply with a worker count.

Snails 1.0 runs one server process. `WORKERS` and `-w` are accepted but do not add processes; run more copies or containers when one process is not enough.

The cost is a build toolchain. The app needs the Spinel compiler and the native libraries named in the deployment chapter; the build is part of the release, not a `bundle install` away. Debugging a native binary is different from debugging a Ruby process, and the gem ecosystem is gone as described above.

The gain is the deployment shape: one artifact, one process, no Ruby runtime, and no GVL between request handlers.

## Integration tests against a real server

`bin/test` builds the app, boots it on a spare port, and sends real HTTP requests through the harness. One fresh server serves the suite; each case resets the tables it declares. Nothing mocks the framework out of the way.

The harness runs against a real server on purpose. Stubs and mocks are cheaper to write, so an agent left to choose will often produce a suite that describes the system instead of exercising it. Booting the real server makes the integration path the default, so a passing suite crosses the HTTP boundary.

The cost is a real server and a database in the test path. It is the right default for the request path; a pure function still deserves a focused test.

## The boundary

The result is API-only, with no HTML views or asset pipeline, no Active Record associations, callbacks, or validations, and no gem compatibility. Models are plain classes over SQL, migrations are SQL files, the CLI and the server run without Ruby, and the test suite crosses a real HTTP boundary.

Rails remains the better fit for a team that wants a server-rendered monolith or the Ruby gem ecosystem. Snails is for the case where the JSON boundary is the product, the deployment should be one binary, and the team wants the SQL and the request path visible.

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
