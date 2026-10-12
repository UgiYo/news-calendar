import test from 'node:test';
import assert from 'node:assert/strict';
import {searchMarket,normalizeSearchQuery} from '../src/company-search.js';
import {searchUS,lookupUSSymbol} from '../worker/us-market.js';
test('English symbols and explicit market prefixes resolve to the correct search market',()=>{
 for(const query of ['NVDA','aapl','US:NVDA','NASDAQ:AMD','Apple','ＭＳＦＴ'])assert.equal(searchMarket(query,'TW'),'US');
 assert.equal(searchMarket('2330','TW'),'TW');assert.equal(searchMarket('台積電','TW'),'TW');assert.equal(searchMarket('TW:2330','US'),'TW');
 assert.equal(normalizeSearchQuery(' NASDAQ: AMD '),'AMD');assert.equal(normalizeSearchQuery(' ＵＳ：ＮＶＤＡ '),'NVDA');
});
test('common exact US searches return immediately without requesting SEC or quotes',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('source unavailable');};
 for(const query of ['nvda','Apple','US:MSFT','輝達','ＮＶＤＡ']){
  const result=await searchUS(query,{},fetcher);assert.ok(result.companies.length);assert.equal(calls,0);
 }
});
test('non-seeded US ticker can be verified by a US quote when SEC catalog fails',async()=>{
 const seen=[];const fetcher=async url=>{seen.push(String(url));if(String(url).includes('sec.gov'))return new Response('',{status:403});return Response.json({chart:{result:[{meta:{symbol:'ABNB',currency:'USD',instrumentType:'EQUITY',exchangeName:'NMS',longName:'Airbnb, Inc.'}}]}});};
 const data=await searchUS('ABNB',{},fetcher);assert.equal(data.companies[0].code,'US:ABNB');assert.equal(data.companies[0].full_name,'Airbnb, Inc.');assert.match(data.warning,/SEC/);assert.ok(seen.some(u=>u.includes('finance.yahoo.com')));
});
test('quote lookup never creates a US stock from a foreign, mismatched or unverified symbol',async()=>{
 const valid={symbol:'ABNB',currency:'USD',instrumentType:'EQUITY',exchangeName:'NMS',longName:'Airbnb, Inc.'};
 for(const change of [{symbol:'AAPL'},{currency:'EUR'},{instrumentType:'INDEX'},{exchangeName:'LSE'},{longName:null}])assert.equal(await lookupUSSymbol('ABNB',async()=>Response.json({chart:{result:[{meta:{...valid,...change}}]}})),null);
 assert.equal(await lookupUSSymbol('../secret',async()=>{throw Error('must not fetch');}),null);
});
