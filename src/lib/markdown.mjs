// Markdown rendering shared by the manual and the blog.
//
// Both content trees live outside `src/`, so Astro's own markdown pipeline
// never sees them. The loader builds the HTML here instead: headings get
// stable anchors, and every fenced block goes through the site's highlighter
// so the manual, the blog, and the API reference share one palette.
//
// The manual rewrites chapter links before calling this; the blog writes site
// paths directly. That difference stays in each loader, not in this file.

import { marked, Renderer } from 'marked';
import { highlightCode } from './highlight.mjs';

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

class SiteRenderer extends Renderer {
  code(token) {
    // An indented code block has no fence and so no label; it falls through to
    // the default renderer and comes out as one uncoloured block.
    return token.highlighted ?? super.code(token);
  }
}

/**
 * Render a markdown body as HTML with heading anchors and highlighted fences.
 *
 * @param {string} markdown body without its leading H1 or front matter
 * @returns {string} HTML for the page body
 * @throws {Error} when a fence names a language the highlighter does not load
 */
export function renderMarkdown(markdown) {
  const tokens = marked.lexer(markdown);
  highlightCodeTokens(tokens);
  const html = marked.parser(tokens, { renderer: new SiteRenderer(), gfm: true });
  return html.replace(/<h([2-6])>(.*?)<\/h\1>/g, (_, level, text) => {
    const id = slugify(text);
    return `<h${level} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`;
  });
}
