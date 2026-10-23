import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthSettings, safeNextPath } from '../lib/auth-config.ts';

test('hosted authentication rejects missing, short and known placeholder secrets', () => {
 for(const BETTER_AUTH_SECRET of [undefined, '', 'short', 'slpcc63-local-dev-secret-change-before-prod', 'replace-with-a-strong-random-secret']) {
  assert.throws(()=>getAuthSettings({NODE_ENV:'production',BETTER_AUTH_SECRET}), /not configured securely/);
 }
 assert.equal(getAuthSettings({NODE_ENV:'production',BETTER_AUTH_SECRET:'a-secure-test-value-of-at-least-32-characters',CONTROLLED_SIGNUP_ENABLED:'true'}).allowSignUp,false);
});
test('signup is closed except for explicitly enabled local provisioning',()=>{
 assert.equal(getAuthSettings({NODE_ENV:'development'}).allowSignUp,false);
 assert.equal(getAuthSettings({NODE_ENV:'development',CONTROLLED_SIGNUP_ENABLED:'true'}).allowSignUp,true);
});
test('post-login destinations cannot escape to another origin',()=>{
 for(const v of ['//evil.example','/\\evil.example','https://evil.example','/\nevil']) assert.equal(safeNextPath(v,'/dashboard'),'/dashboard');
 assert.equal(safeNextPath('/app/calendar-sink?tab=feeds','/dashboard'),'/app/calendar-sink?tab=feeds');
});
