// The site's own checks. These can break silently:
//
//   1. a chapter that does not parse, or a chapter link that points nowhere;
//   2. the API index rendering the source repo's own README instead of the
//      site's page, which YARD does whenever one sits in its working directory;
//   3. a font size that names no step of the type scale;
//   4. a code block that lost its highlighting, or a colour that escaped the
//      palette in tokens.css;
//   5. a blog post with missing front matter, a draft that reached the built
//      site or feed, or a feed item with a relative link.
//
// Everything here runs against the build output, so it catches what the site
// actually emits rather than what the templates look like they do.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadChapters, renderMarkdown } from '../src/lib/manual.mjs';
import { formatPostDate, loadPosts, renderPostBody } from '../src/lib/blog.mjs';
import { HIGHLIGHT_LANGUAGES } from '../src/lib/highlight.mjs';
import { performanceFigures } from '../src/lib/performance.mjs';

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

test('renderMarkdown adds heading anchors and rewrites chapter links', () => {
  const html = renderMarkdown(
    '## Run it\n\nSee [hotkeys](07-hotkeys.md#panes) and `bin/dev`.\n\n```sh\nbin/dev\n```\n',
  );
  assert.match(html, /<h2 id="run-it">/);
  assert.ok(html.includes('href="/manual/hotkeys/#panes"'), html);
  assert.match(html, /<code>bin\/dev<\/code>/);
  assert.match(html, /<pre class="code language-sh"[^>]*>/);
});

test('renderMarkdown highlights fenced code and names colours by role', () => {
  // A fence goes through the highlighter, so the block carries the `code`
  // class the site styles, each line is a span, and a colour is a
  // `--syntax-*` reference rather than a hex the theme happened to emit.
  const html = renderMarkdown('```ruby\ndef x\n  1\nend\n```\n');
  assert.match(html, /<pre class="code language-ruby"[^>]*>/);
  assert.match(html, /<span style="color:var\(--syntax-[a-z]+\)">def<\/span>/);
  assert.match(html, /<span class="line">/);
  assert.doesNotMatch(html, /color:#[0-9a-fA-F]{3,8}/);
});

test('a bare fence renders as plain text', () => {
  // A fence used for a file tree or a session transcript carries no label;
  // it still gets the block's shape but no token colours.
  const html = renderMarkdown('```\na < b\n```\n');
  assert.match(html, /<pre class="code language-text"[^>]*>/);
  assert.match(html, /a &#x3C; b/);
});

test('every fence label in the manual has a loaded grammar', () => {
  // A chapter that fences a language the highlighter does not load would fail
  // the build inside renderMarkdown. This reports every offender at once, with
  // the file it came from, rather than failing on the first chapter.
  const offenders = [];
  for (const chapter of loadChapters()) {
    for (const match of chapter.body.matchAll(/^```([a-zA-Z]*)/gm)) {
      const label = match[1] || 'text';
      if (!HIGHLIGHT_LANGUAGES.includes(label)) offenders.push(`${chapter.file} → ${label}`);
    }
  }
  assert.deepEqual(offenders, [], `fences with no grammar:\n${offenders.join('\n')}`);
});

test('no highlighted block carries a literal colour', () => {
  // A hex in the rendered body means a Dracula scope escaped the role map: the
  // colour still works, but it left the palette and tokens.css stopped being
  // the one place a colour is written.
  const offenders = [];
  for (const chapter of loadChapters()) {
    const html = renderMarkdown(chapter.body);
    for (const match of html.matchAll(/(?:color|background):\s*(#[0-9a-fA-F]{3,8})/g)) {
      offenders.push(`${chapter.file} → ${match[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `literal colours in highlighted blocks:\n${offenders.join('\n')}`);
});

test('every blog post has the front matter the index and feed need', () => {
  // A post folder is the URL slug; the title, summary, and date come from its
  // front matter. A missing field would build a page with no date or a feed
  // item with no summary, so the loader refuses before the build.
  const posts = loadPosts();
  assert.ok(posts.length >= 1, 'expected at least the Why Snails post');
  const slugs = new Set();
  for (const post of posts) {
    assert.match(post.slug, /^[\w-]+$/);
    assert.ok(!slugs.has(post.slug), `duplicate slug: ${post.slug}`);
    slugs.add(post.slug);
    assert.ok(post.title.length > 0, `${post.slug} needs a title`);
    assert.ok(post.description.length > 0, `${post.slug} needs a description`);
    assert.match(post.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!post.updated || post.updated >= post.date, `${post.slug} updated before date`);
    assert.ok(!post.draft, `${post.slug} is a draft in the published list`);
  }
});

test('blog posts render with heading anchors and highlighted fences', () => {
  // Posts share the manual's renderer, so the same two regressions matter:
  // a heading that cannot be linked to, and a fence that lost the palette.
  const offenders = [];
  for (const post of loadPosts()) {
    const html = renderPostBody(post);
    if (!/<h2 id="[^"]+">/.test(html)) {
      offenders.push(`${post.slug} has no anchored H2`);
    }
    for (const match of post.body.matchAll(/^```([a-zA-Z]*)/gm)) {
      const label = match[1] || 'text';
      if (!HIGHLIGHT_LANGUAGES.includes(label)) offenders.push(`${post.slug} → ${label}`);
    }
    for (const match of html.matchAll(/(?:color|background):\s*(#[0-9a-fA-F]{3,8})/g)) {
      offenders.push(`${post.slug} → ${match[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `blog rendering problems:\n${offenders.join('\n')}`);
});

test('draft posts stay out of the published list', () => {
  // The public repo cannot hide a draft from git, but it can keep it out of
  // the site, the index, and the feed. A draft that leaks into any of them is
  // an unpublished post published by accident.
  const dir = mkdtempSync(path.join(tmpdir(), 'snails-blog-'));
  const writePost = (slug, draft) => {
    mkdirSync(path.join(dir, slug), { recursive: true });
    writeFileSync(
      path.join(dir, slug, 'index.md'),
      `---\ntitle: ${slug}\ndescription: ${slug} summary\ndate: 2026-11-13\ndraft: ${draft}\n---\n\n## Body\n\nText.\n`,
    );
  };
  try {
    writePost('published', false);
    writePost('draft', true);
    const published = loadPosts({ dir, includeDrafts: false });
    const all = loadPosts({ dir, includeDrafts: true });
    assert.deepEqual(published.map((post) => post.slug), ['published']);
    assert.deepEqual(
      all.map((post) => post.slug).sort(),
      ['draft', 'published'],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a post with an impossible date is refused', () => {
  // A date that passes the YYYY-MM-DD shape but does not exist would roll
  // into the next month and silently build the post under the wrong day.
  const dir = mkdtempSync(path.join(tmpdir(), 'snails-blog-date-'));
  try {
    mkdirSync(path.join(dir, 'bad-date'), { recursive: true });
    writeFileSync(
      path.join(dir, 'bad-date', 'index.md'),
      '---\ntitle: Bad date\ndescription: Bad date summary\ndate: 2026-02-30\n---\n\n## Body\n\nText.\n',
    );
    assert.throws(() => loadPosts({ dir }), /not a real date: 2026-02-30/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the built site has the landing page, the manual, the API reference, and the blog', () => {
  assert.ok(existsSync(path.join(dist, 'index.html')), 'run npm run build first');
  assert.ok(existsSync(path.join(dist, 'api', 'index.html')), 'API reference missing');
  assert.ok(existsSync(path.join(dist, 'blog', 'index.html')), 'blog index missing');
  assert.ok(existsSync(path.join(dist, 'blog', 'rss.xml')), 'blog feed missing');

  const chapters = loadChapters();
  for (const chapter of chapters) {
    assert.ok(
      existsSync(path.join(dist, 'manual', chapter.slug, 'index.html')),
      `${chapter.slug} page missing`,
    );
  }

  const allPosts = loadPosts({ includeDrafts: true });
  for (const post of allPosts) {
    const page = path.join(dist, 'blog', post.slug, 'index.html');
    if (post.draft) {
      assert.ok(!existsSync(page), `draft ${post.slug} was built`);
    } else {
      assert.ok(existsSync(page), `${post.slug} page missing`);
    }
  }
});

test('the feed carries every published post with absolute links', () => {
  // The feed is the copy a newsletter or reader sees. It has to list every
  // published post, address each one absolutely, and never carry a draft or a
  // link that only works on the site.
  const xml = readFileSync(path.join(dist, 'blog', 'rss.xml'), 'utf8');
  const posts = loadPosts();
  assert.match(xml, /<rss version="2.0"/);
  assert.match(xml, /<content:encoded>/);
  for (const post of posts) {
    const url = `https://snails-rb.org/blog/${post.slug}/`;
    assert.ok(xml.includes(`<link>${url}</link>`), `${post.slug} link missing from feed`);
    assert.ok(xml.includes(`<guid isPermaLink="true">${url}</guid>`), `${post.slug} GUID missing`);
    assert.ok(
      xml.includes(`<pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>`),
      `${post.slug} date missing from feed`,
    );
    assert.ok(xml.includes(`<title>${post.title}</title>`), `${post.slug} title missing`);
  }
  assert.ok(
    xml.includes(`<lastBuildDate>${new Date(`${posts[0].date}T00:00:00Z`).toUTCString()}</lastBuildDate>`),
    'lastBuildDate is not the newest post date',
  );
  const drafts = loadPosts({ includeDrafts: true }).filter((post) => post.draft);
  for (const draft of drafts) {
    assert.ok(!xml.includes(`/blog/${draft.slug}/`), `draft ${draft.slug} leaked into the feed`);
  }
  assert.ok(!xml.includes('href="/'), 'feed carries a relative link');
  assert.ok(!xml.includes('src="/'), 'feed carries a relative image');
  assert.ok(!xml.includes('href="#'), 'feed carries a fragment-only link');
});

test('the blog pages advertise the feed and carry the post metadata', () => {
  // A shared post needs its own description and canonical URL; the landing
  // page's description must not follow the article to social platforms.
  const index = readFileSync(path.join(dist, 'blog', 'index.html'), 'utf8');
  assert.ok(index.includes('href="https://snails-rb.org/blog/rss.xml"'), 'feed link missing');
  assert.ok(index.includes('rel="alternate"'), 'feed discovery link missing');

  for (const post of loadPosts()) {
    const html = readFileSync(path.join(dist, 'blog', post.slug, 'index.html'), 'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="https://snails-rb.org/blog/${post.slug}/">`));
    assert.ok(html.includes(`<meta name="description" content="${post.description}">`));
    assert.ok(html.includes('<meta property="og:type" content="article">'));
    assert.ok(html.includes(`<time datetime="${post.date}">${formatPostDate(post.date)}</time>`));
  }
});

test('the landing install command follows the source repository', () => {
  // The dist repository was retired when releases moved into snails; a copy
  // button that hands over the old URL installs nothing. The URL is split by
  // <wbr/> for phone wrapping, so strip the tags before matching.
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const text = html.replace(/<[^>]+>/g, '');
  assert.ok(
    text.includes('raw.githubusercontent.com/snails-rb/snails/main/install.sh'),
    'the landing page does not install from snails-rb/snails',
  );
  assert.ok(!text.includes('snails-rb/dist'), 'the landing page still names the retired dist repo');
});

test('each landing stat pairs its value with the column it came from', () => {
  // The comparison table orders columns as Snails | Rails | cluster, while the
  // landing page lists cluster before default. An index picked by position
  // silently prints Rails-default figures under a cluster label, which the
  // table refresh cannot catch. Read the expected strings from the same table
  // the page reads, so new benchmark figures do not make this test stale.
  const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const figures = performanceFigures();
  const stats = [
    {
      row: 'Response time, 95th percentile',
      heading: 'p95 latency',
      label: 'Rails (cluster mode)',
      column: 1,
    },
    {
      row: 'Launch to first answer',
      heading: 'Startup time',
      label: 'Rails (default)',
      column: 2,
    },
    {
      row: 'Memory under load',
      heading: 'Memory under load',
      label: 'Rails (cluster mode)',
      column: 1,
    },
  ];
  for (const { row, heading, label, column } of stats) {
    const values = figures.rowValues(row);
    const expected = `${heading} ${values[0]} ${label} ${values[column]}`;
    assert.ok(text.includes(expected), `${heading} does not read "${expected}"`);
  }
});

test('the manual has no landing page and no link points at one', () => {
  // The chapter list already lives in the sidebar of every chapter, so a
  // `/manual/` index would repeat it. There is no such page, and no link may
  // point at it: a redirect page in between would paint before the chapter
  // loaded, which is the flash this replaced.
  assert.ok(!existsSync(path.join(dist, 'manual', 'index.html')), '/manual/ should not be built');

  const entry = '/manual/';
  const offenders = [];
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      if (match[1] === entry) offenders.push(path.relative(dist, file));
    }
  }
  assert.deepEqual(offenders, [], `links to /manual/:\n${offenders.join('\n')}`);
});

test('every internal link resolves to a built file', () => {
  const missing = [];
  for (const file of htmlFiles(dist)) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = match[1];
      if (!target.startsWith('/') || target.startsWith('//')) continue;
      const withoutHash = target.split('#')[0];
      const relative = withoutHash.slice(1);
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
    html.includes('public surface of the Snails runtime'),
    'the API index is not templates/yard/api-index.md',
  );
  assert.ok(
    !html.includes('bash scripts/test-runtime.sh'),
    'the API index carries the Snails repo README instead of the site page',
  );
});

test('the shared header and the centered pages use one shell width', () => {
  // The header brand has to start where the landing hero, the manual sidebar,
  // and the API navigation start; a wider header pushes the content inward.
  const header = readFileSync(path.resolve(process.cwd(), 'src/styles/site-header.css'), 'utf8');
  const site = readFileSync(path.resolve(process.cwd(), 'src/styles/site.css'), 'utf8');
  const api = readFileSync(path.resolve(process.cwd(), 'bin/build-api'), 'utf8');

  assert.match(header, /\.site-header-inner\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(header, /\.site-header-inner\s*\{[^}]*max-width:\s*72rem/s);
  assert.match(site, /\.page\.wide\s*\{[^}]*max-width:\s*72rem/s);
  assert.match(site, /\.page\.with-sidebar\s*\{[^}]*max-width:\s*72rem/s);
  assert.match(api, /\.yard-body\s*\{[^}]*max-width:\s*72rem/s);
});

test('the built API chrome carries the header shell', () => {
  // The API pages do not load site.css, so the generated site-chrome.css has
  // to carry the header width itself. A missing copy shows up as a brand that
  // sits one padding step left of the API navigation.
  const css = readFileSync(path.join(dist, 'api', 'css', 'site-chrome.css'), 'utf8');
  assert.match(css, /\.site-header-inner\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /\.site-header-inner\s*\{[^}]*max-width:\s*72rem/s);

  const html = readFileSync(path.join(dist, 'api', 'index.html'), 'utf8');
  assert.ok(html.includes('href="/blog/">Blog</a>'), 'API header has no blog link');
});

test('the spacing scale is a 4px base', () => {
  // The step name is the number of 4px units, so --space-4 is 1rem. A token
  // that does not match the scale would make the numbered steps meaningless.
  const tokens = readFileSync(path.resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const steps = [...tokens.matchAll(/--space-(\d+):\s*([\d.]+)rem/g)].map((match) => ({
    step: Number(match[1]),
    rem: Number(match[2]),
  }));
  assert.ok(steps.length > 0, 'expected spacing tokens');
  for (const { step, rem } of steps) {
    assert.equal(rem * 16, step * 4, `--space-${step} is not ${step * 4}px`);
  }
});

test('the type steps tokens.css declares are the nine the scale names', () => {
  const tokens = readFileSync(path.resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  const names = [...tokens.matchAll(/--text-([\w-]+):/g)].map((match) => match[1]);
  assert.deepEqual(names, ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl']);
});
