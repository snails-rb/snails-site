import { defineConfig } from 'astro/config';

// The site is served from its own domain root, so every link is built from
// `base`. Set SITE_BASE=/snails-site/ to preview the retired GitHub Pages
// repository path; no other file needs to change.
const base = process.env.SITE_BASE ?? '/';

export default defineConfig({
  // `trailingSlash: 'always'` keeps `/manual/welcome-to-snails/` canonical:
  // GitHub Pages serves `manual/welcome-to-snails/index.html` for it, the same
  // shape the build emits.
  trailingSlash: 'always',
  output: 'static',
  base,
  build: { format: 'directory' },
  server: { port: 4211 },
});
