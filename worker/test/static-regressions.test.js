import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

test('service worker sends authenticated snooze acknowledgements', async () => {
  const sw = await readFile(resolve(repoRoot, 'sw.js'), 'utf8');

  assert.match(sw, /const sessionToken = await config\.get\('sessionToken', ''\);/);
  assert.match(sw, /Authorization: 'Bearer ' \+ sessionToken/);
  assert.match(sw, /return resp\.ok;/);
  assert.match(sw, /if \(ok\) await notifyClients\(\{ type: 'reminder-snoozed', reminderId \}\);/);
});

test('PWA keeps unsynced local reminders until upload succeeds', async () => {
  const app = await readFile(resolve(repoRoot, 'app.js'), 'utf8');

  assert.match(app, /pendingSync: true/);
  assert.match(app, /updatedAt: r\.updatedAt \|\| r\.createdAt \|\| Date\.now\(\)/);
  assert.match(app, /if \(r\.pendingSync\) \{/);
  assert.match(app, /if \(!byId\.has\(l\.id\) && !l\.pendingSync\) \{/);
});
