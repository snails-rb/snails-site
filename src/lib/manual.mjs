// Manual loader — the content input is the vendored manual/ copy of
// snails-rb/snails. The two-digit prefix is the reading order and stays out of
// URLs; the rest of the filename is the slug. Chapters link to each other by
// filename, and the loader rewrites those links to the chapter's site path.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { marked, Renderer } from 'marked';
import { highlightCode } from './highlight.mjs';

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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Code blocks are highlighted before parsing rather than inside the renderer:
// an async renderer returns a Promise, and `marked` concatenates that into the
// HTML as text. The highlighted HTML is stored on the token, and the renderer
// below emits it. Fenced blocks nest inside list items, so the walk follows
// `tokens` and `items` both.
function highlightCodeTokens(tokens) {
  for (const token of tokens) {
    if (token.type === 'code') {
      token.highlighted = highlightCode(token.text, token.lang);
    }
    if (Array.isArray(token.tokens)) highlightCodeTokens(token.tokens);
    if (Array.isArray(token.items)) highlightCodeTokens(token.items);
  }
}

class ManualRenderer extends Renderer {
  code(token) {
    // An indented code block has no fence and so no label; it falls through to
    // the default renderer and comes out as one uncoloured block.
    return token.highlighted ?? super.code(token);
  }
}

// The chapter's own H1 is rendered by the page; headings from H2 down get
// stable anchors so chapters can be linked to section by section.
export function renderMarkdown(markdown) {
  const tokens = marked.lexer(rewriteLinks(markdown));
  highlightCodeTokens(tokens);
  const html = marked.parser(tokens, { renderer: new ManualRenderer(), gfm: true });
  return html.replace(/<h([2-6])>(.*?)<\/h\1>/g, (_, level, text) => {
    const id = slugify(text);
    return `<h${level} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  });
}
