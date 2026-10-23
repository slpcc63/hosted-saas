import assert from 'node:assert/strict';
import test from 'node:test';
import { getDatabaseUrl } from '../lib/db-config.ts';
const binding = {VERCEL_ENV:'preview',PREVIEW_DATABASE_HOST:'ep-test.example',PREVIEW_DATABASE_NAME:'preview',PREVIEW_DATABASE_ROLE:'demo'};
test('Preview refuses missing binding and a different database endpoint, database or role',()=>{
 assert.throws(()=>getDatabaseUrl({VERCEL_ENV:'preview',DATABASE_URL:'postgres://demo:fake@ep-test.example/preview'}));
 for(const value of ['postgres://demo:fake@production.example/preview','postgres://demo:fake@ep-test.example/production','postgres://owner:fake@ep-test.example/preview']) assert.throws(()=>getDatabaseUrl({...binding,DATABASE_URL:value}),/isolated Preview/);
});
test('Preview accepts its pooled endpoint with certificate verification',()=>{
 assert.equal(new URL(getDatabaseUrl({...binding,DATABASE_URL:'postgres://demo:fake@ep-test-pooler.example/preview?sslmode=require'})).searchParams.get('sslmode'),'verify-full');
});
test('hosted environments never fall back to a local database',()=>{
 assert.throws(()=>getDatabaseUrl({NODE_ENV:'production'}),/not configured/);
 assert.equal(new URL(getDatabaseUrl({NODE_ENV:'development'})).hostname,'127.0.0.1');
});
