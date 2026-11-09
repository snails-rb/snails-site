import { defineConfig } from 'astro/config';
import { loadChapters } from './src/lib/manual.mjs';

// The site is deployed to GitHub Pages under the repository path, so every
// link is built from `base`. Set SITE_BASE=/ once a custom domain serves the
// site from the root; no other file needs to change.
const base = process.env.SITE_BASE ?? '/snails-site/';

// `/manual/` has no landing page of its own — a chapter index would repeat the
// sidebar that every chapter already shows. It redirects to the first chapter
// instead, which keeps old links and bookmarks working.
//
// The destination carries `base` itself: Astro writes the configured value into
// the href verbatim, so a bare `/manual/...` would 404 under the repository path.
const basePrefix = base.endsWith('/') ? base.slice(0, -1) : base;
const firstChapter = loadChapters()[0];

export default defineConfig({
  // `trailingSlash: 'always'` keeps `/manual/welcome/` canonical: GitHub Pages
  // serves `manual/welcome/index.html` for it, the same shape the build emits.
  trailingSlash: 'always',
  output: 'static',
  base,
  build: { format: 'directory' },
  redirects: {
    '/manual': `${basePrefix}/manual/${firstChapter.slug}/`,
  },
  server: { port: 4211 },
});
