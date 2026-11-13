// Blog loader. Posts are site-owned content: one folder per post under `blog/`,
// with `index.md` holding the front matter and body. The folder name is the URL
// slug, so a post keeps its address when the title changes.
//
// The date is front matter, never the URL or the build clock. A post is a
// dated record; the manual remains the current reference for behavior.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { renderMarkdown } from './markdown.mjs';
import { SITE_URL } from './site.mjs';

const DEFAULT_DIR = path.resolve(process.cwd(), 'blog');
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_PATTERN = /^[\w-]+$/;

export const DEFAULT_AUTHOR = 'Snails';
export const FEED_DESCRIPTION =
  'Dated notes on the design, benchmarks, and releases behind Snails.';

export function blogDir() {
  return process.env.BLOG_DIR || DEFAULT_DIR;
}

function postError(file, message) {
  return new Error(`blog/${path.basename(path.dirname(file))}/index.md: ${message}`);
}

function splitFrontMatter(source, file) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw postError(file, 'add front matter between --- lines');
  }
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) {
    throw postError(file, 'front matter is not closed with ---');
  }
  const metadataText = normalized.slice(4, end);
  let metadata;
  try {
    metadata = parse(metadataText) ?? {};
  } catch (error) {
    throw postError(file, `front matter is not valid YAML: ${error.message}`);
  }
  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw postError(file, 'front matter must be a mapping of fields');
  }
  return { metadata, body: normalized.slice(end + 5).trim() };
}

function requiredText(metadata, field, file) {
  const value = metadata[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw postError(file, `front matter needs a non-empty "${field}"`);
  }
  return value.trim();
}

function dateText(value, field, file) {
  if (value instanceof Date) {
    value = value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw postError(file, `front matter "${field}" must be a YYYY-MM-DD date`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw postError(file, `front matter "${field}" is not a real date: ${value}`);
  }
  return value;
}

function loadPost(folder, dir) {
  const file = path.join(dir, folder, 'index.md');
  const slug = folder;
  if (!SLUG_PATTERN.test(slug)) {
    throw postError(file, 'the folder name must be a slug made of letters, digits, and hyphens');
  }

  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw postError(file, 'each post folder needs an index.md');
    }
    throw error;
  }

  const { metadata, body: rawBody } = splitFrontMatter(source, file);
  const title = requiredText(metadata, 'title', file);
  const description = requiredText(metadata, 'description', file);
  const date = dateText(metadata.date, 'date', file);
  const updated = metadata.updated === undefined ? null : dateText(metadata.updated, 'updated', file);
  if (updated && updated < date) {
    throw postError(file, '"updated" cannot be earlier than "date"');
  }

  if (metadata.draft !== undefined && typeof metadata.draft !== 'boolean') {
    throw postError(file, '"draft" must be true or false');
  }
  const draft = metadata.draft === true;
  const author =
    metadata.author === undefined ? DEFAULT_AUTHOR : requiredText(metadata, 'author', file);

  const body = rawBody.replace(/^#\s+.+?\s*\n+/, '').trim();
  if (!body) {
    throw postError(file, 'the post has no body after its title');
  }

  return { slug, title, description, date, updated, author, draft, body };
}

/**
 * Load blog posts, newest first.
 *
 * @param {object} [options]
 * @param {string} [options.dir] blog content directory
 * @param {boolean} [options.includeDrafts] include `draft: true` posts
 * @returns {Array<object>} post metadata and bodies
 * @throws {Error} when a post folder or its front matter is malformed
 */
export function loadPosts({
  dir = blogDir(),
  includeDrafts = process.env.BLOG_DRAFTS === '1',
} = {}) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`blog directory not found: ${dir}`);
    throw error;
  }

  const posts = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadPost(entry.name, dir));

  return posts
    .filter((post) => includeDrafts || !post.draft)
    .sort((left, right) => {
      if (left.date !== right.date) return left.date < right.date ? 1 : -1;
      return left.slug.localeCompare(right.slug);
    });
}

export function formatPostDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function renderPostBody(post) {
  return renderMarkdown(post.body);
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cdata(text) {
  return `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

function rfc822(date) {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

function absoluteHtml(html, pageUrl) {
  // Feed readers have no site origin. Resolve every link and image against the
  // post URL so a fragment, a root path, and a file next to the post all point
  // at the article rather than at the feed.
  return html.replace(/(href|src)="([^"]*)"/g, (_, attribute, target) => {
    const absolute = new URL(target, pageUrl).href;
    return `${attribute}="${absolute}"`;
  });
}

/**
 * Render the blog RSS feed. The feed carries the full post body, so a reader or
 * a newsletter can use the article without opening the site; links and images
 * are absolute because feed readers have no site origin.
 *
 * @param {Array<object>} posts published posts, newest first
 * @returns {string} RSS 2.0 XML
 * @throws {Error} when there are no posts or a post has no body
 */
export function renderRss(posts) {
  if (posts.length === 0) {
    throw new Error('the blog feed needs at least one published post');
  }

  const items = posts.map((post) => {
    const url = `${SITE_URL}/blog/${post.slug}/`;
    const html = absoluteHtml(renderPostBody(post), url);
    return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${url}</link>
  <guid isPermaLink="true">${url}</guid>
  <pubDate>${rfc822(post.date)}</pubDate>
  <dc:creator>${escapeXml(post.author)}</dc:creator>
  <description>${cdata(post.description)}</description>
  <content:encoded>${cdata(html)}</content:encoded>
</item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Snails Blog</title>
    <link>${SITE_URL}/blog/</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${rfc822(posts[0].date)}</lastBuildDate>
    <atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>
`;
}
