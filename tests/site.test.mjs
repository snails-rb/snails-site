// The site's own checks. Four things can break silently:
//
//   1. a chapter that does not parse, or a chapter link that points nowhere;
//   2. the API index rendering the source repo's own README instead of the
//      site's page, which YARD does whenever one sits in its working directory;
//   3. a root-absolute link that ignores the deploy path, which only shows up
//      once GitHub Pages serves the site from /snails-site/;
//   4. a font size that names no step of the type scale.
//
// Everything here runs against the build output, so it catches what the site
// actually emits rather than what the templates look like they do.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadChapters, renderMarkdown, url } from '../src/lib/manual.mjs';

const base = process.env.SITE_BASE ?? '/snails-site/';
const dist = path.resolve(process.cwd(), 'dist');

function htmlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') ? [full] : [];
  });
}

test('every chapter in manual/ parses with a number, slug, and title', () => {
  const chapters = loadChapters();
  assert.ok(chapters.length >= 2, 'expected at least the welcome and getting-started chapters');
  for (const chapter of chapters) {
    assert.match(chapter.number, /^\d\d$/);
    assert.match(chapter.slug, /^[\w-]+$/);
    // 01 is the welcome chapter — the only one allowed to be empty.
    if (chapter.number !== '01') {
      assert.ok(chapter.title && !chapter.empty, `${chapter.file} needs a # title and a body`);
    }
  }
});

test('inter-chapter links resolve to existing chapters', () => {
  const chapters = loadChapters();
  const slugs = new Set(chapters.map((chapter) => chapter.slug));
  for (const chapter of chapters) {
    for (const match of chapter.body.matchAll(/\]\((\d\d)-([\w-]+)\.md(?:#[^)]*)?\)/g)) {
      assert.ok(slugs.has(match[2]), `${chapter.file} links to missing ${match[1]}-${match[2]}.md`);
    }
  }
});

test('renderMarkdown adds heading anchors and rewrites chapter links through url()', () => {
  const html = renderMarkdown(
    '## Run it\n\nSee [hotkeys](07-hotkeys.md#panes) and `bin/dev`.\n\n```sh\nbin/dev\n```\n',
  );
  assert.match(html, /<h2 id="run-it">/);
  assert.ok(html.includes(`href="${url('/manual/hotkeys/')}#panes"`), html);
  assert.match(html, /<code>bin\/dev<\/code>/);
  assert.match(html, /<pre><code/);
});

test('url() rejects a relative path', () => {
  assert.throws(() => url('manual/'), /root-relative/);
});

test('the built site has the landing page, the manual, and the API reference', () => {
  assert.ok(existsSync(path.join(dist, 'index.html')), 'run npm run build first');
  assert.ok(existsSync(path.join(dist, 'manual', 'index.html')), 'manual entry missing');
  assert.ok(existsSync(path.join(dist, 'api', 'index.html')), 'API reference missing');

  const chapters = loadChapters();
  for (const chapter of chapters) {
    assert.ok(
      existsSync(path.join(dist, 'manual', chapter.slug, 'index.html')),
      `${chapter.slug} page missing`,
    );
  }
});

test('/manual/ redirects to the first chapter instead of a duplicate index', () => {
  // The chapter list already lives in the sidebar of every chapter, so a
  // separate manual landing page only repeated it. `/manual/` is a redirect
  // page, and it has to point at the first chapter under the deploy path.
  const firstChapter = loadChapters()[0];
  const target = url(`/manual/${firstChapter.slug}/`);
  const html = readFileSync(path.join(dist, 'manual', 'index.html'), 'utf8');
  assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0;url=${target}"`));
  assert.ok(
    existsSync(path.join(dist, 'manual', firstChapter.slug, 'index.html')),
    `redirect target ${target} missing`,
  );
});

test('no link ignores the deploy path', () => {
  // Internal links must start with the base. A root-absolute href like
  // /manual/x/ works locally at the root and 404s once Pages serves the site
  // from /snails-site/, which is exactly the failure this catches.
  const offenders = [];
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
      if (!match[1].startsWith(base)) offenders.push(`${path.relative(dist, file)} → ${match[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `links outside ${base}:\n${offenders.join('\n')}`);
});

test('every internal link resolves to a built file', () => {
  const missing = [];
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = match[1];
      if (!target.startsWith('/') || target.startsWith('//')) continue;
      const withoutHash = target.split('#')[0];
      if (!withoutHash.startsWith(base)) continue;
      const relative = withoutHash.slice(base.length);
      const direct = path.join(dist, relative);
      // A directory URL resolves to its index.html, the way Pages serves it.
      const asIndex = path.join(dist, relative, 'index.html');
      if (!existsSync(direct) && !existsSync(asIndex)) {
        missing.push(`${path.relative(dist, file)} → ${target}`);
      }
    }
  }
  assert.deepEqual(missing, [], `broken internal links:\n${missing.join('\n')}`);
});

test('every font size in the site styles comes from the type scale', () => {
  // The scale is eight steps in tokens.css and is the whole typography
  // decision. A page that invents its own size (12.5px, 1.9rem) drifts off the
  // grid one rule at a time, and nothing else in the build notices.
  const sources = ['src/styles/site.css', 'src/styles/site-header.css', 'bin/build-api'];
  const stray = [];
  for (const file of sources) {
    const lines = readFileSync(path.resolve(process.cwd(), file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/font-size:\s*([^;}]+)/g)) {
        const value = match[1].trim();
        if (/^var\(--text-[\w-]+\)$/.test(value)) continue;
        stray.push(`${file}:${index + 1} ${value}`);
      }
    });
  }
  assert.deepEqual(stray, [], `font sizes outside the scale:\n${stray.join('\n')}`);
});

test('/api/ is the site\'s own index, not the source repo README', () => {
  // YARD renders a README.md found in its working directory as the index page
  // and ignores --readme. bin/build-api renders in a stage that holds only the
  // copied runtime tree and the site's index page, so the API landing page must
  // carry our text — not the upstream repository's install and CI notes.
  const html = readFileSync(path.join(dist, 'api', 'index.html'), 'utf8');
  assert.ok(
    html.includes('public surface of the snails runtime'),
    'the API index is not templates/yard/api-index.md',
  );
  assert.ok(
    !html.includes('bash scripts/test-runtime.sh'),
    'the API index carries the snails repo README instead of the site page',
  );
});

test('the type steps tokens.css declares are the eight the scale names', () => {
  const tokens = readFileSync(path.resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const names = [...tokens.matchAll(/--text-([\w-]+):/g)].map((match) => match[1]);
  assert.deepEqual(names, ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl']);
});
