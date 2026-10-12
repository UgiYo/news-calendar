import test from 'node:test';
import assert from 'node:assert/strict';
import {setSyncOwner,syncEnabled,setSyncEnabled,saveDeviceData,deviceData,deviceRequest,rememberCloudWatchlist,mergeNews} from '../src/account-sync.js';
import {setWatchlistSync,restoreWatchlistSync} from '../src/watchlist-sync.js';
const tw={code:'2330',name:'台積電'},us={code:'US:NVDA',name:'輝達'};
function storage(){const rows=new Map();globalThis.localStorage={getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,String(v))};return rows;}
function server(companies=[],enabled=null){const calls=[];const state={companies:[...companies],enabled};const request=async(path,options={})=>{
 calls.push([path,options.body]);
 if(path==='/account-settings'){if(options.body)state.enabled=options.body.sync_enabled;return {owner_id:'alice',sync_enabled:state.enabled};}
 if(path==='/watchlists'){
  if(options.body&&!state.companies.some(c=>c.code===options.body.code))state.companies.push({code:options.body.code});
  return options.body?{ok:true}:{companies:state.companies.map(c=>({...c}))};
 }
 if(path.startsWith('/watchlists?')){state.companies=state.companies.filter(c=>c.code!==new URL(path,'https://test').searchParams.get('code'));return {ok:true};}
 if(path.startsWith('/companies?'))return {companies:[{code:new URL(path,'https://test').searchParams.get('q')}]};
 throw Error('Unexpected '+path);
 };return {state,calls,request};}
test('enabling sync uploads both markets and a new same-account device adopts the cloud switch and full list',async()=>{
 storage();setSyncOwner('alice');saveDeviceData({companies:[tw,us],news:[]});const cloud=server();
 await setWatchlistSync(true,{request:cloud.request});assert.equal(cloud.state.enabled,true);assert.deepEqual(cloud.state.companies.map(c=>c.code),['2330','US:NVDA']);assert.equal(syncEnabled(),true);
 storage();setSyncOwner('alice');const result=await restoreWatchlistSync({request:cloud.request});assert.equal(result.enabled,true);assert.equal(syncEnabled(),true);assert.deepEqual(deviceData().companies.map(c=>c.code),['2330','US:NVDA']);
 assert.equal(await deviceRequest('/watchlists',{},async()=>{throw Error('must use cloud mode');}),undefined);
 assert.ok(cloud.calls.every(([path])=>!path.includes('market=')));
});
test('other-device additions are fetched and remote removals are never resurrected from the old snapshot',async()=>{
 storage();setSyncOwner('alice');setSyncEnabled(true);rememberCloudWatchlist('alice',[tw,us]);const cloud=server([tw,{code:'US:AMD'}],true);
 const result=await restoreWatchlistSync({request:cloud.request});assert.equal(result.changed,true);assert.deepEqual(deviceData().companies.map(c=>c.code),['2330','US:AMD']);assert.ok(!cloud.calls.some(([path,body])=>path==='/watchlists'&&body));
});
test('offline add/remove deltas merge with both markets without losing another-device additions',async()=>{
 storage();setSyncOwner('alice');rememberCloudWatchlist('alice',[tw,us]);const cloud=server([tw,us,{code:'US:MSFT'}],true);
 await deviceRequest('/watchlists?code=US%3ANVDA',{method:'DELETE'},cloud.request);
 await deviceRequest('/watchlists',{body:{code:'US:AMD'}},cloud.request);
 await deviceRequest('/watchlists',{body:{code:'2303'}},cloud.request);
 await restoreWatchlistSync({request:cloud.request});assert.deepEqual(cloud.state.companies.map(c=>c.code).sort(),['2303','2330','US:AMD','US:MSFT']);assert.deepEqual(deviceData().pendingAdds,[]);assert.deepEqual(deviceData().pendingRemoves,[]);
});
test('cloud switch off is adopted by another device while preserving its full account list',async()=>{
 storage();setSyncOwner('alice');setSyncEnabled(true);rememberCloudWatchlist('alice',[tw]);const cloud=server([tw,us],false);
 const result=await restoreWatchlistSync({request:cloud.request});assert.equal(result.enabled,false);assert.equal(syncEnabled(),false);assert.deepEqual(deviceData().companies.map(c=>c.code),['2330','US:NVDA']);
 assert.equal((await deviceRequest('/watchlists',{},cloud.request)).companies.length,2);
});
test('legacy enabled device migrates all markets while opt-out is preserved when the account has no setting',async()=>{
 storage();setSyncOwner('alice');saveDeviceData({companies:[tw,us],news:[]});setSyncEnabled(true);const cloud=server();await restoreWatchlistSync({request:cloud.request});assert.equal(cloud.state.enabled,true);assert.equal(cloud.state.companies.length,2);
 storage();setSyncOwner('alice');saveDeviceData({companies:[tw,us],news:[]});const optedOut=server();await restoreWatchlistSync({request:optedOut.request});assert.equal(syncEnabled(),false);assert.equal(optedOut.state.enabled,null);assert.equal(optedOut.calls.length,1);
});
test('failed setting persistence leaves local tracking and switch intact for retry; AI results are independent',async()=>{
 storage();setSyncOwner('alice');saveDeviceData({companies:[tw,us],news:[]});const cloud=server();
 const request=async(path,options)=>{if(path==='/account-settings'&&options.body)throw Error('settings unavailable');if(path.startsWith('/account-results'))throw Error('must not depend on AI');return cloud.request(path,options);};
 await assert.rejects(setWatchlistSync(true,{request}),/settings unavailable/);assert.equal(syncEnabled(),false);assert.equal(deviceData().companies.length,2);
 await setWatchlistSync(true,{request:cloud.request});assert.equal(syncEnabled(),true);assert.equal(cloud.state.companies.length,2);
});
test('account switch during settings restoration stops uploads and does not touch the new account',async()=>{
 storage();setSyncOwner('alice');saveDeviceData({companies:[tw,us],news:[]});let writes=0;
 await assert.rejects(restoreWatchlistSync({request:async(path,options)=>{if(options?.body)writes++;setSyncOwner('bob');return {owner_id:'alice',sync_enabled:true};}}),/登入帳號已變更/);
 assert.equal(writes,0);assert.equal(deviceData('bob'),null);assert.equal(syncEnabled('bob'),false);
 setSyncOwner('alice');await assert.rejects(restoreWatchlistSync({request:async()=>({owner_id:'bob',sync_enabled:true})}),/登入身分/);assert.equal(syncEnabled(),false);
});
test('the same article for a Taiwan listing and US ADR survives device-only snapshot and de-duplication',async()=>{
 storage();setSyncOwner('alice');const a={company_code:'2330',url:'https://same/story',title:'台積電'},b={...a,company_code:'US:TSM'};assert.equal(mergeNews([a],[b]).length,2);
 saveDeviceData({companies:[tw,{code:'US:TSM'}],news:[a]});const cloud=server([tw,{code:'US:TSM'}],true);setSyncEnabled(true);
 await setWatchlistSync(false,{request:cloud.request,news:[b]});assert.equal(deviceData().news.length,2);assert.equal(cloud.state.enabled,false);
});
