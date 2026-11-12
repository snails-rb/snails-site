// Worker routing checks. The static site is served by the ASSETS binding;
// this file covers the one host the Worker answers itself.
//
// www 요청은 apex 도메인으로 301 리다이렉트하고, 경로와 쿼리를 그대로 보존한다.

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

test('www redirects to the apex and keeps the path and query', async () => {
  const response = await worker.fetch(
    new Request('https://www.snails-rb.org/manual/welcome-to-snails/?from=www'),
    {},
  );

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get('location'),
    'https://snails-rb.org/manual/welcome-to-snails/?from=www',
  );
});
