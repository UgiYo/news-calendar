import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {accountSettingsRoute} from '../worker/account-settings.js';
test('sync preference is authenticated, account-wide, strictly validated and private to its owner',async()=>{
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('alice'),('bob');");
 const sql=(q,...args)=>{const s=db.prepare(q);return {first:async()=>s.get(...args)||null,run:async()=>s.run(...args)};};
 const call=(who,body)=>accountSettingsRoute(new Request('https://api.test/account-settings',{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined}),{sql,reply:(data,status=200)=>Response.json(data,{status}),user:who?{id:who}:null});
 try{
  assert.equal((await call()).status,401);assert.equal((await (await call('alice')).json()).sync_enabled,null);
  assert.equal((await call('alice',{sync_enabled:true,user_id:'bob'})).status,400);
  assert.equal((await call('alice',{sync_enabled:'true'})).status,400);
  assert.equal((await call('alice',{sync_enabled:true})).status,200);assert.equal((await (await call('alice')).json()).sync_enabled,true);
  const bob=await (await call('bob')).json();assert.equal(bob.owner_id,'bob');assert.equal(bob.sync_enabled,null);
  await call('bob',{sync_enabled:false});assert.equal((await (await call('alice')).json()).sync_enabled,true);
  await call('alice',{sync_enabled:false});assert.equal((await (await call('alice')).json()).sync_enabled,false);
 }finally{db.close();}
});
