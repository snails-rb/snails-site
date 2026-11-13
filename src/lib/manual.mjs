// Manual loader — the content input is the vendored manual/ copy of
// snails-rb/snails. The two-digit prefix is the reading order and stays out of
// URLs; the rest of the filename is the slug. Chapters link to each other by
// filename, and the loader rewrites those links to the chapter's site path.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { renderMarkdown as renderSiteMarkdown } from './markdown.mjs';

const DEFAULT_DIR = path.resolve(process.cwd(), 'manual');

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

// The manual has no landing page: the chapter list is in every chapter's
// sidebar. Links to the manual go straight to the first chapter, in the same
// order the sidebar uses.
export function firstChapterUrl() {
  const [firstChapter] = loadChapters();
  if (!firstChapter) throw new Error(`${manualDir()} has no manual chapters`);
  return `/manual/${firstChapter.slug}/`;
}

// `07-hotkeys.md#anchor` → `/manual/hotkeys/#anchor`. Chapter links are the
// only links a chapter writes as filenames; the rewrite turns them into site
// paths.
export function rewriteLinks(markdown) {
  return markdown.replace(
    /\]\((\d\d)-([\w-]+)\.md(#[^)]*)?\)/g,
    (_, _number, slug, fragment = '') => `](/manual/${slug}/${fragment})`,
  );
}

// The chapter's own H1 is rendered by the page; headings from H2 down get
// stable anchors so chapters can be linked to section by section.
export function renderMarkdown(markdown) {
  return renderSiteMarkdown(rewriteLinks(markdown));
}
