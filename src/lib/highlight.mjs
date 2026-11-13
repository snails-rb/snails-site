// Syntax highlighting for the manual's and blog's code blocks.
//
// Both content trees are rendered by `marked` in `src/lib/markdown.mjs`, not
// by Astro's own markdown pipeline: the chapters and posts live outside
// `src/`, and the manual loader rewrites chapter links before rendering.
// Astro's built-in highlighting therefore never reaches these blocks, so the
// highlighter is wired in explicitly here.
//
// Highlighting runs at build time: the output is plain `<span style>` markup
// naming `--syntax-*` roles, and the browser ships no highlighter. The palette
// lives in `src/styles/tokens.css` next to the rest of the site's colours, so
// the rendered HTML never carries a hex value.
//
// Only the grammars the manual actually fences are loaded. An unknown fence
// language fails the build rather than rendering an unhighlighted block: a
// chapter that says `go` would otherwise look like a deliberate choice to
// skip colour instead of a missing grammar.

import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
// The individual grammar and theme entries rather than the full bundle: the
// build needs four grammars, and the bundle would carry every language.
// `.mjs` is shiki's own export map (`./*` → `./dist/*`), so shiki stays the
// single declared dependency.
import dracula from 'shiki/themes/dracula.mjs';
import ruby from 'shiki/langs/ruby.mjs';
import shellscript from 'shiki/langs/shellscript.mjs';
import sql from 'shiki/langs/sql.mjs';
import toml from 'shiki/langs/toml.mjs';

// Fence label → grammar. `HIGHLIGHT_LANGUAGES` is the set this module accepts.
// `text: null` is shiki's passthrough: it keeps a block's shape (a file tree
// or a session transcript) without pretending to colour it.
const GRAMMARS = {
  ruby,
  sh: shellscript,
  sql,
  toml,
  text: null,
};

export const HIGHLIGHT_LANGUAGES = Object.keys(GRAMMARS);

// Dracula's token hexes → the role names in `tokens.css`. A value the theme
// uses but this map omits stays a literal hex in the output, which the page
// test then reports as a colour that escaped the palette.
const COLOR_REPLACEMENTS = {
  '#6272a4': 'var(--syntax-comment)',
  '#8be9fd': 'var(--syntax-cyan)',
  '#50fa7b': 'var(--syntax-green)',
  '#ffb86c': 'var(--syntax-orange)',
  '#ff79c6': 'var(--syntax-pink)',
  '#bd93f9': 'var(--syntax-purple)',
  '#ff5555': 'var(--syntax-red)',
  '#f1fa8c': 'var(--syntax-yellow)',
  '#e9f284': 'var(--syntax-yellow)',
  '#8be9fe': 'var(--syntax-cyan)',
  '#f8f8f2': 'var(--fg)',
};

// One highlighter for the whole build, created on first use. The theme is
// Dracula itself and the role names come from COLOR_REPLACEMENTS, so there is
// one mapping from token to colour rather than two.
let highlighter = null;

function loadHighlighter() {
  if (highlighter) return highlighter;
  highlighter = createHighlighterCoreSync({
    themes: [dracula],
    langs: Object.values(GRAMMARS).filter((grammar) => grammar !== null),
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

// The markdown body of a block ends with a newline, and shiki turns that into
// one more empty line — a blank row inside the block's padding. Dropping it
// keeps the rendered block the height the source reads as.
function withoutTrailingNewline(code) {
  return code.replace(/\n$/, '');
}

/**
 * Highlight one code block as HTML.
 *
 * The output is `<pre class="code language-<label>">` so the manual styles it
 * with the same rules as the API reference's blocks, and every token colour is
 * a `var(--syntax-…)` reference from `tokens.css`.
 *
 * @param {string} code the block's body, without the fence lines
 * @param {string} label the fence info string (`ruby`, `sh`, …); empty for a
 *   bare fence or an indented block, which render as plain text
 * @returns {string} a highlighted `<pre class="code …">` block
 * @throws {Error} when the label names a grammar this module does not load
 */
export function highlightCode(code, label) {
  const fenceLabel = (label ?? '').trim().toLowerCase();
  const grammarName = fenceLabel === '' ? 'text' : fenceLabel;

  if (!HIGHLIGHT_LANGUAGES.includes(grammarName)) {
    throw new Error(
      `unknown code fence language "${grammarName}" — add its grammar to GRAMMARS in src/lib/highlight.mjs`,
    );
  }

  const html = loadHighlighter().codeToHtml(withoutTrailingNewline(code), {
    lang: grammarName,
    theme: 'dracula',
    colorReplacements: COLOR_REPLACEMENTS,
    rootStyle: false,
    transformers: [
      {
        name: 'manual-block',
        pre(node) {
          // The class mirrors the fence the chapter wrote, not the grammar's
          // internal name: `sh` stays `language-sh` for a reader inspecting the
          // page, while the highlighter resolves its own alias.
          node.properties.class = `code language-${grammarName}`;
        },
      },
    ],
  });

  return html;
}
