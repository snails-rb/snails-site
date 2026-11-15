# Snails API

<div class="api-intro">
  <p class="api-lede">Snails is a Rails-like framework for API-only Ruby apps. It keeps the Rails conventions an API needs, removes the layers that add runtime overhead, and compiles the app into one native binary.</p>
  <p class="api-meta">1.0 · MIT licensed · <a href="https://github.com/snails-rb/snails">Source on GitHub</a> · <a href="/manual/welcome-to-snails/">Read the manual</a></p>
</div>

## Framework namespaces

The public API has six namespaces. `Snails` is the application layer, `Sqlx` is the database layer, `ActionController` and `ActionDispatch` form the HTTP stack, and `ActionMailer` and `ActiveJob` handle email and background jobs. Each card links to a namespace; the [manual](/manual/welcome-to-snails/) explains how they work together.

<div class="api-modules">
  <a class="api-module" href="/api/Snails.html">
    <span class="api-module-name">Snails</span>
    <span class="api-module-body">App configuration, forms, logging, cache, time zones, the test harness, and the health check.</span>
  </a>
  <a class="api-module" href="/api/Sqlx.html">
    <span class="api-module-name">Sqlx</span>
    <span class="api-module-body">Models over SQL, queries, rows, database adapters, enums, and error classes.</span>
  </a>
  <a class="api-module" href="/api/ActionController.html">
    <span class="api-module-name">ActionController</span>
    <span class="api-module-body">Controllers, request parameters, HTTP authentication, JSON rendering, and rate limiting.</span>
  </a>
  <a class="api-module" href="/api/ActionDispatch.html">
    <span class="api-module-name">ActionDispatch</span>
    <span class="api-module-body">Router, request and response, MIME negotiation, multipart uploads, and remote IP.</span>
  </a>
  <a class="api-module" href="/api/ActionMailer.html">
    <span class="api-module-name">ActionMailer</span>
    <span class="api-module-body">Mailers, messages, delivery methods, and the in-memory delivery log the test harness reads.</span>
  </a>
  <a class="api-module" href="/api/ActiveJob.html">
    <span class="api-module-name">ActiveJob</span>
    <span class="api-module-body">Jobs, the in-process queue, the database queue, and the scheduler for delayed jobs.</span>
  </a>
</div>

<p class="api-note">The helper methods added to <code>Array</code>, <code>Enumerable</code>, <code>Hash</code>, <code>Integer</code>, <code>Object</code>, <code>String</code>, and <code>Time</code> are documented on those classes' pages; the <a href="/manual/ruby-helpers/">Ruby Helpers</a> chapter explains them.</p>

## Using the reference

- **Classes** lists every public class and module, grouped by namespace.
- **Methods** lists the public methods in one index.
- **Files** shows the source file an entry comes from.
- **Search** finds a class or method by name.

Every entry comes from the comments in `runtime/`. The code is the source of truth; if a comment and the code disagree, the comment is wrong.

## Manual

The manual explains how to use Snails; this reference lists the public API.

<ul class="api-links">
  <li><a href="/manual/welcome-to-snails/">Welcome to Snails</a> — what Snails is and what it leaves out.</li>
  <li><a href="/manual/coming-from-rails/">Coming from Rails</a> — what carries over from Rails, and what's different.</li>
  <li><a href="/manual/routes-and-controllers/">Routes and Controllers</a> — how requests reach controllers.</li>
  <li><a href="/manual/database-and-models/">Database and Models</a> — SQL models, the schema, and generated column readers.</li>
  <li><a href="/manual/testing/">Testing</a> — real HTTP tests with a table reset per case.</li>
  <li><a href="/manual/deploying/">Deploying</a> — one binary, one process, and the system libraries it needs.</li>
</ul>

## Source and license

Snails is MIT licensed. The framework and manual live in [`snails-rb/snails`](https://github.com/snails-rb/snails); this reference is generated from its `runtime/` tree. Use [discussions](https://github.com/snails-rb/snails/discussions) for questions and [issues](https://github.com/snails-rb/snails/issues) for bug reports.
