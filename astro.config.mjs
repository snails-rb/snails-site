import { defineConfig } from 'astro/config';

export default defineConfig({
  // `trailingSlash: 'always'` keeps `/manual/welcome-to-snails/` canonical:
  // GitHub Pages serves `manual/welcome-to-snails/index.html` for it, the same
  // shape the build emits.
  trailingSlash: 'always',
  output: 'static',
  build: { format: 'directory' },
  server: { port: 4211 },
});
