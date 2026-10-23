import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { packagePublicSite } from '../scripts/build-public-site.mjs';

test('public release excludes server functions, customer routes, public files and env secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-artifact-'));
  try {
    await mkdir(join(root, '.next/server/app'), { recursive: true });
    await mkdir(join(root, '.next/static/chunks'), { recursive: true });
    await mkdir(join(root, '.vercel/output/functions/private.func'), { recursive: true });
    await mkdir(join(root, 'public'), { recursive: true });
    await writeFile(join(root, '.env.local'), 'DO_NOT_SHIP=secret');
    await writeFile(join(root, 'public/private.csv'), 'DO_NOT_SHIP');
    await writeFile(join(root, '.next/server/app/customer.html'), 'DO_NOT_SHIP');
    await writeFile(join(root, '.next/server/app/route.js'), 'DO_NOT_SHIP');
    for (const name of ['index', 'privacy', 'terms']) await writeFile(join(root, `.next/server/app/${name}.html`), `<html><body>${name}</body></html>`);
    await writeFile(join(root, '.next/static/chunks/menu.js'), 'public menu');
    const output = await packagePublicSite(root);
    assert.deepEqual((await readdir(output)).sort(), ['config.json', 'static']);
    assert.deepEqual((await readdir(join(output, 'static'))).sort(), ['404.html', '_next', 'index.html', 'privacy.html', 'terms.html']);
    assert.equal(await readFile(join(output, 'static/_next/static/chunks/menu.js'), 'utf8'), 'public menu');
    const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'));
    assert.equal(config.version, 3);
    assert.equal(config.routes.at(-1).status, 404);
    assert.ok(config.routes.every(route => !route.middlewarePath));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('packaging fails if a public page is missing, preserving the previous artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-artifact-'));
  try {
    await mkdir(join(root, '.vercel/output'), { recursive: true });
    await writeFile(join(root, '.vercel/output/previous'), 'keep');
    await assert.rejects(packagePublicSite(root), /ENOENT/);
    assert.equal(await readFile(join(root, '.vercel/output/previous'), 'utf8'), 'keep');
  } finally { await rm(root, { recursive: true, force: true }); }
});
