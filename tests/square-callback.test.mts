import assert from 'node:assert/strict';
import test from 'node:test';
import {squareCallbackUrl} from '../lib/square-callback.ts';
test('Preview callback uses its immutable deployment, ignoring inherited shared callback',()=>{
 assert.equal(squareCallbackUrl({VERCEL_ENV:'preview',VERCEL_URL:'tcm-test.vercel.app',SQUARE_REDIRECT_URI:'https://calendar.example/callback'}),'https://tcm-test.vercel.app/api/integrations/square/callback');
 assert.throws(()=>squareCallbackUrl({VERCEL_ENV:'preview'}));
});
test('non-Preview callback behavior is preserved',()=>{
 assert.equal(squareCallbackUrl({SQUARE_REDIRECT_URI:'https://app.example/callback'}),'https://app.example/callback');
});
