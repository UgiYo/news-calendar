import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveSpotifyPodcast} from '../worker/podcasts.js';
test('Spotify lookup keeps matching shows and authors, removes unsafe feeds and duplicates',async()=>{
 const calls=[];const fetcher=async(url,options)=>{assert.equal(options.redirect,'manual');calls.push(url);return calls.length===1?new Response('<meta property="og:title" content="測試節目"/>'):Response.json({results:[{collectionName:'測試節目',artistName:'作者甲',feedUrl:'https://feeds.example.com/a.xml'},{collectionName:'測試節目',artistName:'作者乙',feedUrl:'https://feeds.example.com/b.xml'},{collectionName:'別的節目',feedUrl:'https://feeds.example.com/c.xml'},{collectionName:'測試節目',feedUrl:'https://127.0.0.1/a'},{collectionName:'測試節目',feedUrl:'https://feeds.example.com/a.xml'}]});};
 const result=await resolveSpotifyPodcast('https://open.spotify.com/intl-zh/show/1234567890123456789012?si=tracking',fetcher);
 assert.equal(result.candidates.length,2);assert.equal(result.candidates[1].author,'作者乙');assert.match(calls[0],/open.spotify.com\/show/);assert.match(calls[1],/itunes.apple.com/);
});
test('Spotify resolver rejects episode and unrelated URLs without fetching',async()=>{
 for(const url of ['https://evil.example/show/1234567890123456789012','https://open.spotify.com/episode/1234567890123456789012'])await assert.rejects(resolveSpotifyPodcast(url,()=>{throw Error('must not fetch');}),/節目連結/);
});
test('Spotify resolver reports no candidates instead of choosing an unrelated show',async()=>{
 let i=0;assert.deepEqual((await resolveSpotifyPodcast('https://open.spotify.com/show/1234567890123456789012',async()=>i++?Response.json({results:[{collectionName:'不同節目',feedUrl:'https://example.com/feed'}]}):new Response('<meta property="og:title" content="測試節目"/>'))).candidates,[]);
});

test('Spotify redirects are rejected before following another host',async()=>{
 let calls=0;await assert.rejects(resolveSpotifyPodcast('https://open.spotify.com/show/1234567890123456789012',async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://example.com'}});}),/暫時無法讀取/);assert.equal(calls,2);
});

test('Verified user show resolves during directory outages',async()=>{const result=await resolveSpotifyPodcast('https://open.spotify.com/show/6SjGs5mgZ4IAo82tHygxD2?si=copy',()=>{throw Error('offline');});assert.equal(result.candidates[0].author,'小朋友團隊');assert.match(result.candidates[0].feed,/feed.firstory.me/);});
test('Directory redirect stays on official host and returns candidates',async()=>{let count=0;const result=await resolveSpotifyPodcast('https://open.spotify.com/show/1234567890123456789012',async()=>{count++;if(count===1)return new Response('<meta property="og:title" content="測試節目"/>');if(count===2)return new Response(null,{status:301,headers:{Location:'https://itunes.apple.com/search?term=test'}});return Response.json({results:[{collectionName:'測試節目',feedUrl:'https://example.com/feed'}]});});assert.equal(count,3);assert.equal(result.candidates.length,1);});
test('verified financial show resolves with copy-link parameters without directory requests',async()=>{
 const result=await resolveSpotifyPodcast('https://open.spotify.com/show/1HOGxT9M7a6kpcDi4q27Q7?si=copy&utm_source=copy-link',()=>{throw Error('directory HTTP 429');});
 assert.equal(result.title,'游庭皓的財經皓角');assert.equal(result.candidates[0].feed,'https://feeds.soundcloud.com/users/soundcloud:users:735679489/sounds.rss');
});
test('directory failures try each source once and preserve diagnostics without inventing a feed',async()=>{
 const calls=[];const result=await resolveSpotifyPodcast('https://open.spotify.com/show/1234567890123456789012',async url=>{calls.push(url);return calls.length===1?new Response('<meta property="og:title" content="測試節目"/>'):new Response('limited',{status:429});});
 assert.equal(calls.length,3);assert.equal(result.candidates.length,0);assert.match(result.warning,/RSS/);assert.match(result.diagnostics.join(';'),/HTTP 429/);assert.ok(calls[2].startsWith('https://api.fyyd.de/'));
});
test('resolver caches successful show candidates across tracking URLs and still requires login',async()=>{
 const {sharedPodcastsRoute}=await import('../worker/podcasts.js');const original=globalThis.caches,rows=new Map();let reads=0,writes=0;
 globalThis.caches={default:{match:async key=>{reads++;return rows.get(key.url)?.clone();},put:async(key,response)=>{writes++;assert.equal(response.headers.get('Cache-Control'),'public, max-age=86400');rows.set(key.url,response);}}};
 const call=async(url,user={id:'one'})=>sharedPodcastsRoute(new Request('https://api.example/podcasts/resolve',{method:'POST',body:JSON.stringify({url})}),{user,reply:data=>Response.json(data)});
 try{const show='https://open.spotify.com/show/1HOGxT9M7a6kpcDi4q27Q7';assert.equal((await (await call(show+'?si=a')).json()).candidates.length,1);await call(show+'?si=b');assert.equal(writes,1);assert.equal(reads,2);assert.equal((await (await call(show,null)).json()).error,'請先登入');assert.equal(reads,2);}finally{if(original===undefined)delete globalThis.caches;else globalThis.caches=original;}
});

test('unlisted show uses alternate directory during Apple 429 with exact title and safe feed filtering',async()=>{
 const result=await resolveSpotifyPodcast('https://open.spotify.com/show/1234567890123456789012',async url=>{
  if(url.startsWith('https://open.spotify.com/'))return new Response('<meta content="新節目" property="og:title"/>');
  if(url.startsWith('https://itunes.apple.com/'))return new Response('limited',{status:429});
  assert.ok(url.startsWith('https://api.fyyd.de/0.2/search/podcast?term='));return Response.json({status:1,data:[{title:'新節目',author:'作者',xmlURL:'https://feeds.example.com/new.xml'},{title:'其他節目',xmlURL:'https://feeds.example.com/other.xml'},{title:'新節目',xmlURL:'https://127.0.0.1/feed'}]});
 });assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].source,'fyyd');assert.equal(result.candidates[0].author,'作者');assert.match(result.warning,/備援/);
});
test('Spotify metadata fallback handles page failures and uses the same directory chain',async()=>{
 const calls=[];const result=await resolveSpotifyPodcast('https://open.spotify.com/show/1234567890123456789012',async url=>{calls.push(url);if(calls.length===1)return new Response('blocked',{status:503});if(url.includes('/oembed?'))return Response.json({title:'Metadata Show'});return Response.json({results:[{collectionName:'Metadata Show',feedUrl:'https://example.com/rss'}]});});
 assert.equal(result.title,'Metadata Show');assert.equal(result.candidates.length,1);assert.ok(calls[1].startsWith('https://open.spotify.com/oembed?'));
});
test('show advertised RSS avoids directories and unsafe advertised feeds are ignored',async()=>{
 let count=0;const result=await resolveSpotifyPodcast('https://open.spotify.com/show/1234567890123456789012',async()=>{count++;return new Response('<meta property="og:title" content="Public Show"/><link rel="alternate" type="application/rss+xml" href="https://127.0.0.1/feed"/><link href="https://example.com/rss" type="application/rss+xml" rel="alternate"/>');});assert.equal(count,1);assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].source,'spotify');
});
