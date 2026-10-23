import assert from 'node:assert/strict';
import test from 'node:test';
import {databaseDate} from '../lib/database-date.ts';
test('pg DATE objects retain their calendar day across process timezones',()=>{
 const prior=process.env.TZ;
 try { for(const tz of ['UTC','America/Los_Angeles','Asia/Tokyo']) {process.env.TZ=tz;assert.equal(databaseDate(new Date(2026,9,21)),'2026-10-21');} } finally {if(prior)process.env.TZ=prior;else delete process.env.TZ;}
});
test('ISO dates remain valid HTML/filter/CSV values; invalid values fail',()=>{
 assert.equal(databaseDate('2026-10-21'),'2026-10-21');assert.equal(databaseDate('2026-10-21T00:00:00.000Z'),'2026-10-21');assert.throws(()=>databaseDate(new Date(NaN)));
});
