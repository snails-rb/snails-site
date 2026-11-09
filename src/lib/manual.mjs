// Manual loader — the content input is the vendored manual/ copy of
// snails-rb/snails. The two-digit prefix is the reading order and stays out of
// URLs; the rest of the filename is the slug. Chapters link to each other by
// filename, and every URL the site emits goes through `url()` so the deploy
// path (GitHub Pages repository subpath, or a custom domain root) stays in one
// place.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const DEFAULT_DIR = path.resolve(process.cwd(), 'manual');

// Mirrors astro.config.mjs: SITE_BASE overrides the default repository path.
const base = process.env.SITE_BASE ?? '/snails-site/';
const prefix = base.endsWith('/') ? base.slice(0, -1) : base;

// `url('/manual/welcome/')` → `/snails-site/manual/welcome/`.
export function url(absolutePath) {
  if (!absolutePath.startsWith('/')) {
    throw new Error(`url() expects a root-relative path, got ${absolutePath}`);
  }
  return prefix + absolutePath;
}

export function manualDir() {
  return process.env.MANUAL_DIR || DEFAULT_DIR;
}

export function loadChapters(dir = manualDir()) {
  const files = readdirSync(dir)
    .filter((file) => /^\d\d-[\w-]+\.md$/.test(file))
    .sort();
  return files.map((file) => {
    const baseName = file.replace(/\.md$/, '');
    const number = baseName.slice(0, 2);
    const slug = baseName.slice(3);
    const source = readFileSync(path.join(dir, file), 'utf8');
    const title = source.match(/^#\s+(.+?)\s*$/m)?.[1] ?? 'Welcome';
    const body = source.replace(/^#[^\n]*\n/, '').trim();
    return { file, number, slug, title, body, empty: body.length === 0 };
  });
}

// `07-hotkeys.md#anchor` → `<base>manual/hotkeys/#anchor`. Chapter links are
// the only root-relative links a chapter writes; they go through `url()` here
// so the rendered HTML already carries the deploy path.
export function rewriteLinks(markdown) {
  return markdown.replace(
    /\]\((\d\d)-([\w-]+)\.md(#[^)]*)?\)/g,
    (_, _number, slug, fragment = '') => `](${url(`/manual/${slug}/`)}${fragment})`,
  );
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The chapter's own H1 is rendered by the page; headings from H2 down get
// stable anchors so chapters can be linked to section by section.
export function renderMarkdown(markdown) {
  const html = marked.parse(rewriteLinks(markdown));
  return html.replace(/<h([2-6])>(.*?)<\/h\1>/g, (_, level, text) => {
    const id = slugify(text);
    return `<h${level} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  });
}
