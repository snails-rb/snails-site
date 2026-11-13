// The public origin. Canonical links and the RSS feed need absolute URLs; every
// page path stays root-relative so a subpath build still works.

export const SITE_URL = 'https://snails-rb.org';

export function absoluteUrl(pathname) {
  return `${SITE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}
