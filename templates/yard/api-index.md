# Snails API

<div class="api-intro">
  <p class="api-lede">Snails is a Rails-like framework for API-only Ruby apps. It keeps the Rails conventions an API needs, removes the layers that add runtime overhead, and compiles the app into one native binary. This reference covers the framework's public modules; the manual covers the conventions and workflows.</p>
  <p class="api-meta">1.0 release candidate · MIT licensed · <a href="https://github.com/snails-rb/snails">Source on GitHub</a> · <a href="/manual/welcome-to-snails/">Read the manual</a></p>
</div>

## Framework namespaces

The public API is organized into six namespaces. `Snails` holds the app-facing pieces and `Sqlx` the data layer; `ActionController` and `ActionDispatch` handle the request path; `ActionMailer` and `ActiveJob` cover mail and background work. The cards below open each namespace, and the [manual](/manual/welcome-to-snails/) explains how they fit together.

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
    <span class="api-module-body">Controllers, action params, the HTTP authentication handshake, JSON rendering, and rate limiting.</span>
  </a>
  <a class="api-module" href="/api/ActionDispatch.html">
    <span class="api-module-name">ActionDispatch</span>
    <span class="api-module-body">Router, request and response, MIME negotiation, multipart uploads, and remote-IP handling.</span>
  </a>
  <a class="api-module" href="/api/ActionMailer.html">
    <span class="api-module-name">ActionMailer</span>
    <span class="api-module-body">Mailers, messages, delivery methods, and the in-memory delivery log the test harness reads.</span>
  </a>
  <a class="api-module" href="/api/ActiveJob.html">
    <span class="api-module-name">ActiveJob</span>
    <span class="api-module-body">Jobs, the in-process queue, the database queue, and the scheduler that runs delayed work.</span>
  </a>
</div>

<p class="api-note">The helpers that extend <code>Array</code>, <code>Enumerable</code>, <code>Hash</code>, <code>Integer</code>, <code>Object</code>, <code>String</code>, and <code>Time</code> are documented under their own names; the <a href="/manual/ruby-helpers/">Ruby Helpers</a> chapter explains them.</p>

## How to read the reference

- **Classes** lists every public class and module, grouped by namespace.
- **Methods** lists the public methods in one index.
- **Files** opens the source file with the comments that produced the entry.
- **Search** finds a class or method by name.

Every entry comes from the comments in `runtime/`. The code is the source of truth; a comment that disagrees with it is a bug in the comment.

## Manual

The manual is the guide; this reference is the lookup.

<ul class="api-links">
  <li><a href="/manual/welcome-to-snails/">Welcome to Snails</a> — the definition, the scope, and the design trade.</li>
  <li><a href="/manual/coming-from-rails/">Coming from Rails</a> — the habits that carry over and the ones that do not.</li>
  <li><a href="/manual/routes-and-controllers/">Routes and Controllers</a> — the request path and the action contract.</li>
  <li><a href="/manual/database-and-models/">Database and Models</a> — SQL models, the schema, and generated readers.</li>
  <li><a href="/manual/testing/">Testing</a> — the real-server harness and per-case table reset.</li>
  <li><a href="/manual/deploying/">Deploying</a> — one binary, one process, and the runtime packages.</li>
</ul>

## Source and license

Snails is MIT licensed. The framework, the manual, and this reference are built from the [`snails-rb/snails`](https://github.com/snails-rb/snails) repository. Questions and bug reports belong in [discussions](https://github.com/snails-rb/snails/discussions) or [issues](https://github.com/snails-rb/snails/issues).
