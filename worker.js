const APEX_HOST = 'snails-rb.org';
const WWW_HOST = `www.${APEX_HOST}`;

// Cloudflare serves the static site through the ASSETS binding. The one
// request the Worker shapes itself is the www host, which redirects to the
// apex so both names share one canonical URL.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === WWW_HOST) {
      url.hostname = APEX_HOST;
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
};
