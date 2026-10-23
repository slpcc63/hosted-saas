import assert from 'node:assert/strict';
import test from 'node:test';
import {runTimeCardDisconnect} from '../lib/time-card-disconnect-policy.ts';
import {disconnectSquareAuthorization} from '../lib/square-disconnect.ts';
test('TCM blocks shared Calendar access before attempting revocation',async()=>{
 let called=false;await assert.rejects(runTimeCardDisconnect({pluginIds:['square-time-card-manager','square-calendar-sink'],disconnect:async()=>{called=true;}}),/shared/);assert.equal(called,false);
});
test('failed remote revoke keeps local connection; retry finalizes only after revoke',async()=>{
 const events:string[]=[];const getConnection=async()=>({id:'synthetic',accessToken:'fake'});
 await assert.rejects(runTimeCardDisconnect({pluginIds:['square-time-card-manager'],disconnect:()=>disconnectSquareAuthorization({getConnection,revokeAccess:async()=>{throw Error('network');},finalizeLocalDisconnect:async()=>{events.push('deleted');}})}),/network/);assert.deepEqual(events,[]);
 const result=await disconnectSquareAuthorization({getConnection,revokeAccess:async()=>{events.push('revoked');return 'revoked';},finalizeLocalDisconnect:async id=>{assert.equal(id,'synthetic');events.push('deleted');}});assert.equal(result,'disconnected');assert.deepEqual(events,['revoked','deleted']);
});
test('repeat disconnect has no remote side effect; inactive grant can finish cleanup',async()=>{
 let calls=0;assert.equal(await disconnectSquareAuthorization({getConnection:async()=>null,revokeAccess:async()=>{calls++;return 'revoked';},finalizeLocalDisconnect:async id=>assert.equal(id,null)}),'already_disconnected');assert.equal(calls,0);
 assert.equal(await disconnectSquareAuthorization({getConnection:async()=>({id:'synthetic',accessToken:'fake'}),revokeAccess:async()=> 'already_inactive',finalizeLocalDisconnect:async()=>{calls++;}}),'already_disconnected');assert.equal(calls,1);
});
