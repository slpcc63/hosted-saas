import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// An allowlisted public artifact: no functions, middleware, app routes, env files,
// customer data, or server code can be copied to the deployment.
export async function packagePublicSite(root) {
  const output = resolve(root, '.vercel/output');
  const pages = [['index.html', 'index.html'], ['privacy.html', 'privacy.html'], ['terms.html', 'terms.html']];
  const contents = await Promise.all(pages.map(async ([source, target]) => {
    const html = await readFile(resolve(root, '.next/server/app', source), 'utf8');
    if (!html.includes('<html') || !html.includes('</html>')) throw new Error(`Public page is not prerendered HTML: ${source}`);
    return [target, html];
  }));
  // Remove only this generated output, after all required source pages validate.
  await rm(output, { recursive: true, force: true });
  await mkdir(resolve(output, 'static/_next'), { recursive: true });
  for (const [target, html] of contents) await writeFile(resolve(output, 'static', target), html);
  await cp(resolve(root, '.next/static'), resolve(output, 'static/_next/static'), { recursive: true });
  await writeFile(resolve(output, 'static/404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found | SLPCC63</title><h1>Page not found</h1><p><a href="/">Return to SLPCC63</a> or <a href="https://app.slpcc63.com/sign-in">sign in to your customer account</a>.</p></html>');
  const config = {
    version: 3,
    routes: [
      { src: '/.*', headers: { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }, continue: true },
      { src: '/privacy/?$', dest: '/privacy.html' },
      { src: '/terms/?$', dest: '/terms.html' },
      { src: '/sign-in/?$', status: 307, headers: { Location: 'https://app.slpcc63.com/sign-in' } },
      { src: '/app/?$', status: 307, headers: { Location: 'https://app.slpcc63.com/dashboard' } },
      { src: '/(?:app/)?(dashboard|calendar-sink|time-card-manager|subscriptions|account)/?$', status: 307, headers: { Location: 'https://app.slpcc63.com/$1' } },
      { handle: 'filesystem' },
      { src: '/.*', status: 404, dest: '/404.html' }
    ]
  };
  await writeFile(resolve(output, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.cwd();
  const db = 'postgresql://preview_disabled:preview_disabled@127.0.0.1:1/no_database?connect_timeout=2';
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'build'], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: db, DATABASE_URL_UNPOOLED: db,
      BILLING_CHECKOUT_ENABLED: 'false', TIME_CARD_MISSING_PUNCH_LIVE: 'false', TIME_CARD_TEXTING_LIVE: 'false',
      SQUARE_APPLICATION_SECRET: 'preview-disabled', RESEND_API_KEY: 'preview-disabled', TWILIO_AUTH_TOKEN: 'preview-disabled' }
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Public-only artifact ready: ${await packagePublicSite(root)}`);
}
