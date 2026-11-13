---
title: Why Snails
description: Six design choices behind Snails, what each one buys, and what each one costs.
date: 2026-11-13
author: Snails
---

Snails is a deliberately narrow take on Rails for API-only apps. It keeps the conventions that make an API legible and removes the layers that assume a monolithic app, a Ruby runtime, or a full ORM. This post explains six choices behind that boundary, what each one buys, and what each one costs. The [manual](/manual/welcome-to-snails/) is the current reference for behavior; this is the reasoning as of November 2026.

Snails assumes that tests and review stay in the loop, and that coding agents do part of the implementation. Much of the design follows from that: keep the common path small enough to read, and make the default path the one you want reviewed. The framework is not a Rails replacement. If you need server-rendered pages, the Ruby gem ecosystem, or Active Record's object model, Rails is the better fit.

## The shape we kept

Routes live in `config/routes.rb`, controllers are classes with actions, forms own validation, mailers and jobs have their own folders, and migrations are numbered files. A new endpoint has a predictable place, and a reviewer can find the request path without a map. That shape is the part of Rails worth keeping: it is a shared vocabulary for people and for coding agents.

The [Coming from Rails](/manual/coming-from-rails/) chapter is the translation table for the habits that carry over and the ones that do not. The rest of this post explains why the boundary sits where it does.

## Views and the asset pipeline: the frontend is a separate choice

Snails has no HTML views, no asset pipeline, and no Hotwire (Turbo and Stimulus). Controllers answer JSON, a redirect, or a status. The frontend can live in the same repository or its own; the JSON boundary is the contract between them.

Rails 7 made Hotwire the default frontend for new applications, and that stack is designed around a server-rendered monolith. Keeping the backend API-only makes the frontend a deliberate choice instead of a default inherited from the server. The backend does not decide whether the frontend is React, a native app, or a server-rendered page in another service.

**What it costs.** There is no integrated server-rendered workflow. There are no view helpers, no CSRF middleware, and no session store; request cookies are parsed, but the framework does not manage sessions. If the frontend is a separate deployment, you now operate two deployables instead of one. If server-rendered pages are the product, another framework is the better fit. See [Requests and Parameters](/manual/requests-and-parameters/) and the [FAQ](/manual/faq/).

## Active Record: keep the SQL visible

A Snails model names its table. The columns come from the schema, and the inherited reads and writes operate on the table. There are no associations, callbacks, or model validations. Validation belongs to form objects, and the schema constraint is the model layer's last line. The common reads and writes use a small query surface with parameterized values; joins, views, and aggregates use raw SQL.

```ruby
class Comment < Sqlx::Base
  def self.table_name = "comments"
end

Comment.fetch_many({ post_id: post.id }, order: :asc)
Post.find_by_sql("SELECT " + Post.projection + " FROM posts WHERE author_id = ?", [ author_id ])
```

The point is not that a coding agent cannot write SQL. It can. The point is that a smaller surface cuts repeated boilerplate and gives the common path a shape that is easier to review. A query that needs a join is written as a query, not assembled through an object graph the reviewer has to reconstruct in their head. Empty conditions are refused instead of quietly matching every row, and writes raise when the database rejects them.

**What it costs.** There is no lazy loading, no association graph, and no callback chain. You write joins and cascades yourself, and a complex domain will need more explicit code than it would under Active Record. The model layer is not an ORM; if you want one object model over the database, Rails is the better fit. See [Database and Models](/manual/database-and-models/), [Querying](/manual/querying/), and [Forms and Validation](/manual/forms/).

## Gem compatibility: the cost of leaving the Ruby runtime

The app, the framework, and the HTTP server compile into one native executable. Spinel is the Ruby-to-native compiler that makes that possible; app code stays Ruby, and the server does not need a Ruby runtime. The CLI is bash as well, so neither the command line nor the server carries a Ruby installation.

**What it costs.** This is the clearest cost in the list. The Ruby gem ecosystem assumes a Ruby runtime and a Bundler load path; a native binary has neither. A gem that depends on a native extension or on runtime introspection has no place in the build. When an app needs a small, well-understood behavior, writing it in the app can be cheaper than carrying a dependency that no longer fits, but the app then owns that code, its tests, and its security updates. Not every gem is replaceable.

The trade is a smaller dependency surface and one deployment artifact. See the [FAQ](/manual/faq/) and [Ruby Helpers](/manual/ruby-helpers/) for the helpers that remain.

## Migrations: SQL files, not a Ruby DSL

A schema change is a numbered SQL file under `db/migrate/`. `snails migrate apply` runs the pending files in order, and `snails migrate dump` regenerates `db/schema.sql` from them. `snails migrate verify` checks that the dump still matches a replay, and `snails migrate check` stops a deploy while anything is pending. If another system owns the schema, `DB_OWNER="external"` tells the CLI to refuse DDL instead of writing it.

```sql
-- Slugs give posts a stable URL segment.
ALTER TABLE posts ADD COLUMN slug TEXT;
```

Keeping the change as SQL makes it directly reviewable. A reviewer can read the statement without translating a Ruby DSL, and a coding agent can write the same file it will apply.

**What it costs.** There is no Rails migration DSL and no generated model definitions from the migration file. The schema stays the source for the generated column readers, and you must regenerate the dump after every change. The migration is a statement about the database, not a model-layer convenience. See [Migrations](/manual/migrations/).

## One native binary: the server and the CLI leave Ruby behind

The generated app builds into one executable that includes the app, the framework, and the HTTP server. The machine that runs that binary does not need Ruby, Bundler, or a separate application server. One process serves requests on the available cores without a worker process per core, and the memory footprint does not multiply with a worker count.

**What it costs.** There is a build step and a toolchain. The app needs the Spinel compiler and the native libraries named in the deployment chapter; the build is part of the release, not a `bundle install` away. Debugging a native binary is different from debugging a Ruby process, and the gem ecosystem is gone as described above.

The gain is the deployment shape: one artifact, one process, no Ruby runtime, and no GVL (Ruby's global VM lock) between request handlers. See [Concurrency](/manual/concurrency/), [Deploying](/manual/deploying/), and the [benchmark](/manual/performance/#how-it-compares).

## Integration tests against a real server

`bin/test` builds the app, boots it on a spare port, and sends real HTTP requests through the harness. One fresh server serves the suite, and each case declares the tables it resets. Nothing mocks the framework out of the way.

The harness runs against a real server on purpose. Stubs and mocks are cheaper to write, so a coding agent left to choose will often produce a suite that describes the system instead of exercising it. Booting the real server makes the integration path the default, so a passing suite crosses the HTTP boundary rather than a set of doubles that stand in for it.

**What it costs.** The suite needs a real server and a database setup, not a pure in-memory unit test. It is the right default for the request path; a pure function still deserves a focused test. See [Testing](/manual/testing/).

## What this adds up to

| Choice | What you gain | What you give up |
|---|---|---|
| No views or asset pipeline | The frontend is a separate, deliberate choice | The integrated server-rendered workflow |
| No Active Record | SQL stays visible and the common path stays small | Associations, callbacks, lazy loading, one object model |
| No gem compatibility | One binary with no Ruby runtime or Bundler path | The Ruby gem ecosystem; the app owns more code |
| SQL migrations | Schema changes are directly reviewable | The Rails migration DSL and its conveniences |
| One native binary | One artifact, one process, no GVL | A build toolchain and native debugging |
| Real-server tests | The default suite crosses the HTTP boundary | A real server and database in the test path |

The boundary is API-only, with no HTML views or asset pipeline; no Active Record associations, callbacks, or validations; no gem compatibility; models as plain classes over SQL; and migrations as SQL files. Rails remains the better fit for a team that wants a server-rendered monolith or the Ruby gem ecosystem.

Snails is for the case where the JSON boundary is the product, the deployment should be one binary, and the team wants the SQL and the request path visible. We are looking for feedback from Rails developers: try an API-only app and tell us which convention you cannot live without. The [repository](https://github.com/snails-rb/snails) and [discussions](https://github.com/snails-rb/snails/discussions) are the place for that.

## References

- [Snails manual](/manual/welcome-to-snails/) — the current reference for behavior.
- [Snails benchmark](https://github.com/snails-rb/snails-benchmark) — method and raw results.
- [Spinel](https://github.com/matz/spinel) — the Ruby-to-native compiler.
- [Rails 7 release notes](https://rubyonrails.org/2021/12/15/Rails-7-fulfilling-a-vision) — the Hotwire default and the monolith it serves.
- [Stack Overflow 2026 AI survey](https://survey.stackoverflow.co/2026/ai) — how teams use coding assistants and agents.
