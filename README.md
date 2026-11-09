# snails-site

The official snails site: a landing page, the manual, and the API reference, built as one static site.

Live at <https://snails-rb.github.io/snails-site/> (GitHub Pages, served from the repository path).

## Run it

```sh
npm install          # once
bundle install       # once — YARD renders the API reference
npm run dev          # http://localhost:4211
```

`npm run dev` renders the manual and landing page only. Run `npm run api -- path/to/snails` first if you want `/api/` while developing; the dev server serves whatever is in `public/api/`.

`npm run build` does both: it renders the API reference into `public/api/`, then builds the site into `dist/`. `npm test` checks the built output.

To see the built site the way GitHub Pages serves it — from the `/snails-site/` subpath — run `bin/preview-pages` after a build. `astro dev` serves at the root, so a link that ignores `base` still works there; `bin/preview-pages` is the only local setup where such a link actually breaks.

## What goes where

| Path | Content | Source |
|---|---|---|
| `/` | landing page | `src/pages/index.astro` |
| `/manual/` | redirect to the first chapter | `astro.config.mjs` |
| `/manual/<slug>/` | one page per manual chapter | `manual/` (vendored) |
| `/api/` | API reference | `runtime/` in [`snails-rb/snails`](https://github.com/snails-rb/snails), rendered by YARD |

There is no manual landing page: the chapter list is in every chapter's sidebar, so `/manual/` only redirects to the first chapter (a client-side `<meta refresh>`, since Pages serves static files).

The site holds a copy of the manual and of nothing else. `runtime/` lives only in the snails repo — `bin/build-api` fetches it at build time, so the API reference can never describe an older tree than the one the source has. The manual copy is committed because the chapter list is part of the site's own navigation; refresh it instead of editing it:

```sh
bin/sync-manual                 # fetch the latest main over https
bin/sync-manual path/to/snails  # copy from a local checkout
```

Commit the refreshed copy; the diff is the review.

## Typography

All three sections set type from one scale of eight steps in `src/styles/tokens.css` (`--text-2xs` … `--text-2xl`, 11px to 30px at the default root size). A page picks a step; it does not invent a size. `bin/build-api` copies the same token file into the YARD output, so the API reference cannot drift from the manual, and `npm test` fails on any `font-size` that does not name a step.

Body prose is 15px, not the browser's 16px: JetBrains Mono is a monospace and every character is wider, so 16px monospace reads like 18px sans. Code, navigation, and tables sit one step down at 13px; headings go 17 / 20 / 30. The reference is <https://omarchy.org/>, which reads at the same 15px.

## Deploy path

GitHub Pages serves this repository at `/snails-site/`, so every internal link is built from `base` in `astro.config.mjs`. When a custom domain serves the site from the root, set `SITE_BASE=/` and nothing else changes — the tests fail on any link that ignores the base, so a missed spot cannot reach a deploy.

## Checks

```sh
npm test                  # built output: pages, links, deploy path, type scale
bin/build-api --check     # render the API twice and diff the results
bin/preview-pages         # serve dist/ at /snails-site/ like Pages does
```

`.github/workflows/site.yml` runs both on every pull request and deploys `dist/` to Pages on `main`.

## Decisions

The plan behind this site — scope, hosting, build pipeline, and the measurements they rest on — lives in the snails planning repo: `plans/website.md`.
