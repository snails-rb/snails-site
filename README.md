# snails-site

The official Snails site: a landing page, the manual, the blog, and the API reference, built as one static site.

Live at <https://snails-rb.org/> (GitHub Pages, served through Cloudflare from the domain root).

## Run it

```sh
npm install          # once
bundle install       # once — YARD renders the API reference
npm run dev          # http://localhost:4211/
```

`npm run dev` renders the landing page, manual, and blog. It does not render the API reference; run `npm run api -- path/to/snails` first if you want `/api/` while developing, because the dev server serves whatever is in `public/api/`.

`npm run build` renders the API reference into `public/api/`, copies blog attachments into `public/blog/`, then builds the site into `dist/`. `npm test` checks the built output.

To see the built site the way the host serves it, run `npm run preview` after a build; it serves `dist/` from the same domain root GitHub Pages uses.

## What goes where

| Path | Content | Source |
|---|---|---|
| `/` | landing page | `src/pages/index.astro` |
| `/manual/<slug>/` | one page per manual chapter | `manual/` (vendored) |
| `/blog/` | dated posts, newest first | `blog/` (site-owned) |
| `/blog/<slug>/` | one post | `blog/<slug>/index.md` |
| `/blog/rss.xml` | RSS feed with the full post body | generated from `blog/` |
| `/api/` | API reference | `runtime/` in [`snails-rb/snails`](https://github.com/snails-rb/snails), rendered by YARD |

There is no manual landing page: the chapter list is in every chapter's sidebar, so every link to the manual goes straight to the first chapter. `/manual/` is not a route.

The site holds the vendored manual and its own blog posts. `runtime/` lives only in the Snails repo — `bin/build-api` fetches it at build time, so the API reference can never describe an older tree than the one the source has. The manual copy is committed because the chapter list is part of the site's own navigation; refresh it instead of editing it:

```sh
bin/sync-manual                 # fetch the latest main over https
bin/sync-manual path/to/snails  # copy from a local checkout
```

Commit the refreshed copy; the diff is the review.

## Blog

Posts are the site's own content, not a second copy of the manual. One folder per post under `blog/<slug>/`; the folder name is the URL slug and stays put when the title changes. The folder's `index.md` carries the post:

```yaml
---
title: A post title
description: One or two sentences for the index, the page snippet, and the feed.
date: 2026-11-13
updated: 2026-11-20   # optional
author: Snails        # optional; defaults to Snails
draft: false          # optional; a draft is not built, indexed, or fed
---
```

`title`, `description`, and `date` are required. `description` is the index summary, the page's meta description, and the feed summary. The date is `YYYY-MM-DD` and displayed as written, in UTC. A post is a dated record: the [manual](manual/01-welcome-to-snails.md) is the current reference for behavior, and the post says what was decided at that time. Use `updated` only for corrections; a new decision is a new post.

Post images and attachments live in the same folder. `bin/build-blog-assets` copies them into `public/blog/<slug>/` before the dev server or build; that directory is generated and ignored. Write links as site paths (`/manual/migrations/`, `/blog/other-post/`), not relative chapter filenames; the site-wide link check fails on a target that does not exist.

Publishing is a normal PR: add the folder, run `npm run build`, `npm test`, and open the PR. `draft: true` keeps a post out of the built site, index, and feed, but the public repository still carries the file in git; writing that must stay private belongs in the planning repository, not here.

The post URL is the canonical address. When the same article appears on another channel, link to it there or set its canonical URL to `https://snails-rb.org/blog/<slug>/`; do not keep a second full copy as the source.

## Copy variants

The intro has three forms, and they answer different questions:

- **Landing (`/`)** is the evaluation copy. One paragraph, outcome and comparison, not a stack inventory. It carries the benchmark and the deployment trade-off; the feature cards and manual links carry the detail.
- **Manual `01-welcome-to-snails.md`** is the canonical definition. It lists the Rails shape and the limits, but no benchmark numbers — the manual's "How it compares" section owns those. The Snails README uses the same opening paragraph.
- **Blog (`/blog/`)** is the dated reasoning. A post can argue, cite, and record what was decided at the time; it is not the current reference. The manual wins when the two disagree, and a post that needs a new decision is a new post.

If a sentence can move between the landing and the manual unchanged, treat it as definition copy and keep it in the manual. The landing must add the choice-making claim.

A repository-specific intro is not needed: visitors get the canonical definition, and evaluators get the landing pitch.

The `<meta name="description">` in `src/layouts/Base.astro` is the default search/social snippet. A blog post passes its own `description`; the landing and manual keep the default from the landing pitch.

## Typography

All four sections set type from one fixed scale in `src/styles/tokens.css`. A page picks a step; it does not invent a size. `bin/build-api` copies the same token file into the YARD output, so the API reference cannot drift from the manual, and `npm test` fails on any `font-size` that does not name a step.

Body prose is 15px, not the browser's 16px: JetBrains Mono is a monospace and every character is wider, so 16px monospace reads like 18px sans. Code, navigation, and tables sit one step down; headings use the larger steps. The reference is <https://omarchy.org/>, which reads at the same 15px.

## Code blocks

The manual and blog are rendered by `marked` in `src/lib/markdown.mjs`, not by Astro's own markdown pipeline — the chapters and posts live outside `src/`, and the manual loader rewrites chapter links before rendering. Astro's built-in highlighting therefore never reaches these blocks, so `src/lib/highlight.mjs` highlights each fence with shiki at build time. The output is `<span style="color:var(--syntax-…)">` markup and the browser ships no highlighter.

The grammar table in `highlight.mjs` lists the fence labels a chapter or post may use. A fence with any other label fails the build instead of rendering uncoloured — add the grammar there when a post needs one. A bare fence renders as plain text.

The `--syntax-*` roles in `src/styles/tokens.css` are the only place a code colour is written, and the API reference names them too: `bin/build-api` maps YARD's tokenizer classes onto the same roles.

## Landing page figures

The performance section on `/` reads its numbers from the manual's comparison table (`manual/01-welcome-to-snails.md`, the "How it compares" table) through `src/lib/performance.mjs` — it does not carry a second copy. The manual is refreshed from the Snails repo on a schedule, so a copied set of figures would keep serving the old values after each refresh.

The build fails when the table stops matching what the page reads: a renamed column, a missing row, or a request count that is not a number. That turns silent drift into a build failure, which is the point — the fix is to update the loader together with the manual.

`bin/sync-manual` brings in new figures; nothing on the landing page needs editing for them, and the ratios are computed from the table rather than written in it.

## Deploy path

GitHub Pages serves the site at <https://snails-rb.org/> from the domain root. Cloudflare proxies the domain; it does not host or build the files. Every internal link is root-relative, so there is no path prefix to configure.

`.github/workflows/site.yml` builds and tests the artifact, then deploys it to GitHub Pages on `main`. Ruby and YARD stay pinned in Actions, where `.ruby-version` and `Gemfile.lock` pin them.

## Checks

```sh
npm run build              # render the API reference and blog attachments, then build dist/
npm test                   # built output: pages, links, type scale
bin/build-api --check      # render the API twice and diff the results
npm run preview            # serve dist/ from the domain root
```

`.github/workflows/site.yml` runs the checks on every pull request and deploys `dist/` to GitHub Pages on `main`.

## Decisions

The plan behind this site — scope, hosting, build pipeline, and the measurements they rest on — lives in the Snails planning repo: `plans/website.md`.
