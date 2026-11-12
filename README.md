# snails-site

The official Snails site: a landing page, the manual, and the API reference, built as one static site.

Live at <https://snails-rb.org/> (Cloudflare Workers, served from the domain root).

## Run it

```sh
npm install          # once
bundle install       # once — YARD renders the API reference
npm run dev          # http://localhost:4211/
```

`npm run dev` renders the manual and landing page only. Run `npm run api -- path/to/snails` first if you want `/api/` while developing; the dev server serves whatever is in `public/api/`.

`npm run build` does both: it renders the API reference into `public/api/`, then builds the site into `dist/`. `npm test` checks the built output.

To see the built site the way Cloudflare Workers serves it, run `npm run preview` after a build. Astro serves both dev and preview under `base`, so a link that ignores the configured base fails there too.

## What goes where

| Path | Content | Source |
|---|---|---|
| `/` | landing page | `src/pages/index.astro` |
| `/manual/` | redirect to the first chapter | `astro.config.mjs` |
| `/manual/<slug>/` | one page per manual chapter | `manual/` (vendored) |
| `/api/` | API reference | `runtime/` in [`snails-rb/snails`](https://github.com/snails-rb/snails), rendered by YARD |

There is no manual landing page: the chapter list is in every chapter's sidebar, so `/manual/` only redirects to the first chapter (a client-side `<meta refresh>`, since the site is static).

The site holds a copy of the manual and of nothing else. `runtime/` lives only in the Snails repo — `bin/build-api` fetches it at build time, so the API reference can never describe an older tree than the one the source has. The manual copy is committed because the chapter list is part of the site's own navigation; refresh it instead of editing it:

```sh
bin/sync-manual                 # fetch the latest main over https
bin/sync-manual path/to/snails  # copy from a local checkout
```

Commit the refreshed copy; the diff is the review.

## Copy variants

The intro has two full variants, and they answer different questions:

- **Landing (`/`)** is the evaluation copy. One paragraph, outcome and comparison, not a stack inventory. It carries the benchmark and the deployment trade-off; the feature cards and manual links carry the detail.
- **Manual `01-welcome-to-snails.md`** is the canonical definition. It lists the Rails shape and the limits, but no benchmark numbers — the manual's "How it compares" section owns those. The Snails README uses the same opening paragraph.

If a sentence can move between the two unchanged, treat it as definition copy and keep it in the manual. The landing must add the choice-making claim.

A repository-specific intro is not needed: visitors get the canonical definition, and evaluators get the landing pitch.

The `<meta name="description">` in `src/layouts/Base.astro` is the search/social snippet. It is one sentence from the landing pitch, not the canonical manual paragraph.

## Typography

All three sections set type from one fixed scale in `src/styles/tokens.css`. A page picks a step; it does not invent a size. `bin/build-api` copies the same token file into the YARD output, so the API reference cannot drift from the manual, and `npm test` fails on any `font-size` that does not name a step.

Body prose is 15px, not the browser's 16px: JetBrains Mono is a monospace and every character is wider, so 16px monospace reads like 18px sans. Code, navigation, and tables sit one step down; headings use the larger steps. The reference is <https://omarchy.org/>, which reads at the same 15px.

## Code blocks

The manual is rendered by `marked` in `src/lib/manual.mjs`, not by Astro's own markdown pipeline — the chapters live outside `src/`, and the loader rewrites chapter links before rendering. Astro's built-in highlighting therefore never reaches these blocks, so `src/lib/highlight.mjs` highlights each fence with shiki at build time. The output is `<span style="color:var(--syntax-…)">` markup and the browser ships no highlighter.

The grammar table in `highlight.mjs` lists the fence labels a chapter may use. A fence with any other label fails the build instead of rendering uncoloured — add the grammar there when a chapter needs one. A bare fence renders as plain text.

The `--syntax-*` roles in `src/styles/tokens.css` are the only place a code colour is written, and the API reference names them too: `bin/build-api` maps YARD's tokenizer classes onto the same roles.

## Landing page figures

The performance section on `/` reads its numbers from the manual's comparison table (`manual/01-welcome-to-snails.md`, the "How it compares" table) through `src/lib/performance.mjs` — it does not carry a second copy. The manual is refreshed from the Snails repo on a schedule, so a copied set of figures would keep serving the old values after each refresh.

The build fails when the table stops matching what the page reads: a renamed column, a missing row, or a request count that is not a number. That turns silent drift into a build failure, which is the point — the fix is to update the loader together with the manual.

`bin/sync-manual` brings in new figures; nothing on the landing page needs editing for them, and the ratios are computed from the table rather than written in it.

## Deploy path

Cloudflare Workers serves the site at <https://snails-rb.org/> from the domain root. Every internal link is built from `base` in `astro.config.mjs`; the default is `/`, and `SITE_BASE=/snails-site/` previews the retired GitHub Pages path.

`wrangler.jsonc` points the Worker at `dist/`. `.github/workflows/site.yml` builds and tests the artifact, then deploys it on `main`; Cloudflare does not build the site, so Ruby and YARD stay pinned in Actions. `worker.js` serves the files through the `ASSETS` binding and redirects `www.snails-rb.org` to the apex.

## Checks

```sh
npm run build              # render the API reference, then build dist/
npm test                   # built output: pages, links, deploy path, type scale
bin/build-api --check      # render the API twice and diff the results
npm run preview            # serve dist/ from the built base
```

`.github/workflows/site.yml` runs the checks on every pull request and deploys `dist/` to Cloudflare Workers on `main`.

## Decisions

The plan behind this site — scope, hosting, build pipeline, and the measurements they rest on — lives in the Snails planning repo: `plans/website.md`.
