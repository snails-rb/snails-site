import { loadPosts, renderRss } from '../../lib/blog.mjs';

export function GET() {
  const posts = loadPosts();
  return new Response(renderRss(posts), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
