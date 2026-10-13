import {canonicalPodcastFeed,dedupePodcastChannels,podcastEpisodeKeys,samePodcastChannel} from '../shared/podcast-identity.js';
import {spotifyShowURL,verifiedSpotifyFeed} from '../shared/spotify-feeds.js';
const fields=['id','title','published_at','date','url','audio_url','description','duration','transcript_url'];
export function podcastFeed(value){
 const u=new URL(String(value||'').trim());const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!h.includes('.')||/^[\d.]+$/.test(h)||h.includes(':')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(h))throw Error('請使用公開 HTTPS Podcast RSS 網址');
 return canonicalPodcastFeed(u.href);
}
function payload(data,id,feed){
 if(!data||typeof data.title!=='string'||!data.title.trim()||data.title.length>500||!Array.isArray(data.episodes)||!data.episodes.length||data.episodes.length>150)throw Error('Podcast 集數資料格式錯誤');
 const episodes=data.episodes.map(e=>{
  if(!e.id||!e.title||!Number.isFinite(Date.parse(e.published_at)))throw Error('Podcast 集數資料格式錯誤');
  const row=Object.fromEntries(fields.map(k=>[k,String(e[k]||'').slice(0,k==='description'?10000:2000)]));
  for(const k of ['url','audio_url','transcript_url'])if(row[k]){const u=new URL(row[k]);if(u.protocol!=='https:'||u.username||u.password)throw Error('Podcast 連結必須是 HTTPS');}
  return row;
 });
 const result={id,feed,title:data.title.trim(),spotify:'',updated_at:new Date().toISOString(),episodes};
 if(new TextEncoder().encode(JSON.stringify(result)).length>1500000)throw Error('Podcast 資料超出大小上限');
 return result;
}
const normalizeTitle=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const decodeHTML=v=>String(v||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(_,n)=>Number(n)<=0x10ffff?String.fromCodePoint(Number(n)):'');
const attributes=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1].toLowerCase(),decodeHTML(m[2])]));
export async function resolveSpotifyPodcast(value,fetcher=globalThis.fetch){
 const url=spotifyShowURL(value),known=verifiedSpotifyFeed(url);
 if(known)return {title:known.title,candidates:[known]};
 const deadline=AbortSignal.timeout(22000),diagnostics=[];
 const read=async(endpoint,host,json=true)=>{for(let redirect=0;redirect<3;redirect++){
  const r=await fetcher(endpoint,{redirect:'manual',signal:AbortSignal.any([deadline,AbortSignal.timeout(5000)]),headers:{Accept:json?'application/json':'text/html','User-Agent':'Mozilla/5.0'}});
  if(r.status>=300&&r.status<400){const next=new URL(r.headers.get('Location')||'',endpoint);if(next.protocol!=='https:'||next.hostname!==host||next.username||next.password||next.port)throw Error('來源轉址不受支援');endpoint=next.href;continue;}
  if(!r.ok)throw Error('HTTP '+r.status);const text=await r.text();if(text.length>2000000)throw Error('回應超過大小上限');return json?JSON.parse(text):text;
 }throw Error('轉址次數過多');};
 let title='',html='';
 try{html=await read(url,'open.spotify.com',false);for(const tag of html.matchAll(/<meta\b[^>]*>/gi)){const attr=attributes(tag[0]);if(attr.property==='og:title'){title=attr.content?.trim()||'';break;}}}catch(e){diagnostics.push('Spotify '+e.message);}
 if(!title){try{const meta=await read('https://open.spotify.com/oembed?url='+encodeURIComponent(url),'open.spotify.com');title=String(meta.title||'').trim();}catch(e){diagnostics.push('Spotify metadata '+e.message);}}
 if(!title||title.length>500)throw Error('Spotify 節目資訊暫時無法讀取，請稍後重試或直接貼上公開 RSS。'+diagnostics.join('；'));
 const target=normalizeTitle(title),seen=new Set(),candidates=[];
 const add=(name,author,value,source)=>{const n=normalizeTitle(name);if(!n||!(n===target||(Math.min(n.length,target.length)>=4&&(n.includes(target)||target.includes(n)))))return;let feed;try{feed=podcastFeed(value);}catch{return;}if(seen.has(feed))return;seen.add(feed);candidates.push({title:String(name).slice(0,500),author:String(author||'').slice(0,500),feed,source});};
 // Read RSS explicitly advertised by the show page; never fetch arbitrary page links.
 for(const tag of html.matchAll(/<link\b[^>]*>/gi)){const attr=attributes(tag[0]);if(attr.rel?.split(/\s+/).includes('alternate')&&['application/rss+xml','application/atom+xml'].includes(attr.type?.toLowerCase()))add(title,'',attr.href,'spotify');}
 if(candidates.length)return {title,candidates};
 try{const results=await read('https://itunes.apple.com/search?media=podcast&entity=podcast&country=TW&limit=25&term='+encodeURIComponent(title),'itunes.apple.com');for(const row of results.results||[])add(row.collectionName||row.trackName,row.artistName,row.feedUrl,'apple');}catch(e){diagnostics.push('Apple Podcast '+e.message);}
 if(!candidates.length){try{const results=await read('https://api.fyyd.de/0.2/search/podcast?term='+encodeURIComponent(title)+'&count=25','api.fyyd.de');if(results.status!==1||!Array.isArray(results.data))throw Error('目錄回應格式異常');for(const row of results.data)add(row.title,row.author,row.xmlURL,'fyyd');}catch(e){diagnostics.push('備援目錄 '+e.message);}}
 return {title,candidates:candidates.slice(0,10),...(diagnostics.length?{warning:candidates.length?'主要搜尋暫時無法使用，已找到備援結果，請核對節目與作者。':'搜尋來源暫時無法使用，請稍後重試或直接貼上公開 RSS。',diagnostics}:{} )};
}
const resolving=new Map();
async function savedSpotifyLookup(sql,url){if(!sql)return null;await sql('CREATE TABLE IF NOT EXISTS spotify_feed_lookups(show_url TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)').run();return sql('SELECT payload,updated_at FROM spotify_feed_lookups WHERE show_url=?',url).first();}
async function podcastChannelGroups(sql,matchTitle=''){
 const rows=(await sql('SELECT id,feed,title,updated_at,last_error FROM podcast_channels ORDER BY id LIMIT 100').all()).results;
 const counts=new Map();for(const row of rows)counts.set(row.title,(counts.get(row.title)||0)+1);
 for(const row of rows)if(counts.get(row.title)>1||row.title===matchTitle){const stored=await sql('SELECT payload FROM podcast_channels WHERE id=?',row.id).first();row.episode_keys=podcastEpisodeKeys(JSON.parse(stored.payload));}
 return dedupePodcastChannels(rows);
}
export async function sharedPodcastsRoute(req,{sql,reply,user,admin=false,hash}){
 const u=new URL(req.url),path=u.pathname;
 if(!['/podcasts/channels','/podcasts/episodes','/admin/podcasts/channels','/admin/podcasts/update','/podcasts/resolve'].includes(path))return null;
 if(!admin&&!user)return reply({error:'請先登入'},401);
 if(path==='/podcasts/resolve'){if(req.method!=='POST')return reply({error:'Method not allowed'},405);try{
  const canonical=spotifyShowURL((await req.json()).url),cache=globalThis.caches?.default,key=new Request(u.origin+'/cache/podcasts/resolve/'+canonical.split('/').at(-1));
  const cached=await cache?.match(key);if(cached)return reply(await cached.json());
  const stored=await savedSpotifyLookup(sql,canonical);
  if(stored&&stored.updated_at>Date.now()-7*86400000)return reply(JSON.parse(stored.payload));
  if(!resolving.has(canonical))resolving.set(canonical,resolveSpotifyPodcast(canonical).finally(()=>resolving.delete(canonical)));
  let result;try{result=await resolving.get(canonical);}catch(e){if(!stored)throw e;result={...JSON.parse(stored.payload),warning:'搜尋暫時無法使用，已提供先前保存的候選 RSS，請再次核對。'};}
  if(!result.candidates.length&&stored)result={...JSON.parse(stored.payload),warning:'未能取得新的搜尋結果，已提供先前保存的候選 RSS，請再次核對。'};
  if(result.candidates.length){const saved={title:result.title,candidates:result.candidates};if(sql&&!result.warning)await sql('INSERT INTO spotify_feed_lookups(show_url,payload,updated_at) VALUES(?,?,?) ON CONFLICT(show_url) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',canonical,JSON.stringify(saved),Date.now()).run();else if(sql&&!stored)await sql('INSERT INTO spotify_feed_lookups(show_url,payload,updated_at) VALUES(?,?,?) ON CONFLICT(show_url) DO NOTHING',canonical,JSON.stringify(saved),Date.now()).run();}
  if(cache)await cache.put(key,Response.json(result,{headers:{'Cache-Control':'public, max-age='+(result.candidates.length?(result.warning?300:86400):60)}}));return reply(result);
 }catch(e){return reply({error:e.message},400);}}
 await sql('CREATE TABLE IF NOT EXISTS podcast_channels(id TEXT PRIMARY KEY,feed TEXT NOT NULL UNIQUE,title TEXT NOT NULL,payload TEXT NOT NULL,created_by TEXT NOT NULL,updated_at TEXT NOT NULL,last_error TEXT)').run();
 if((path==='/podcasts/channels'||path==='/admin/podcasts/channels')&&req.method==='GET')return reply({channels:(await podcastChannelGroups(sql)).sort((a,b)=>a.title.localeCompare(b.title,'zh-TW'))});
 if(path==='/podcasts/episodes'&&req.method==='GET'){
  const id=u.searchParams.get('id'),groups=await podcastChannelGroups(sql),group=groups.find(c=>c.id===id||c.aliases.includes(id));if(!group)return reply({error:'找不到頻道'},404);
  const rows=[];for(const channelId of [group.id,...group.aliases]){const row=await sql('SELECT payload,last_error FROM podcast_channels WHERE id=?',channelId).first();if(row)rows.push(row);}
  const primary=JSON.parse(rows[0].payload),episodes=new Map();for(const row of rows){const data=JSON.parse(row.payload);for(const e of data.episodes){const key=String(e.id||'').replace(data.id+'::','')||e.audio_url;if(!episodes.has(key))episodes.set(key,{...e,id:String(e.id).replace(data.id+'::','')});}}
  return reply({...primary,episodes:[...episodes.values()].sort((a,b)=>b.published_at.localeCompare(a.published_at)),aliases:group.aliases,error:rows.map(r=>r.last_error).filter(Boolean).join('；')});
 }
 if(path==='/podcasts/episodes'&&req.method==='POST'){
  const row=await sql('SELECT id,feed FROM podcast_channels WHERE id=?',u.searchParams.get('id')).first();if(!row)return reply({error:'找不到頻道'},404);
  try{const data=await req.json();if(podcastFeed(data.feed)!==canonicalPodcastFeed(row.feed))throw Error('Feed mismatch');const saved=payload(data,row.id,row.feed);await sql('UPDATE podcast_channels SET title=?,payload=?,updated_at=?,last_error=NULL WHERE id=?',saved.title,JSON.stringify(saved),saved.updated_at,row.id).run();return reply(saved);}catch{return reply({error:'Podcast 更新資料格式錯誤'},400);}
 }
 if(path==='/podcasts/channels'&&req.method==='POST'){
  try{
   const data=await req.json(),feed=podcastFeed(data.feed),id='shared-'+(await hash(feed)).slice(0,24),existing=await sql('SELECT payload FROM podcast_channels WHERE feed=?',feed).first();
   if(existing)return reply({channel:JSON.parse(existing.payload),existing:true});
   const groups=await podcastChannelGroups(sql,data.title);const equivalent=groups.find(c=>samePodcastChannel(c,data));if(equivalent){const stored=await sql('SELECT payload FROM podcast_channels WHERE id=?',equivalent.id).first();return reply({channel:JSON.parse(stored.payload),existing:true});}
   const count=await sql('SELECT COUNT(*) AS total FROM podcast_channels').first();if(count.total>=100)return reply({error:'共用頻道已達 100 個上限'},409);
   const saved=payload(data,id,feed);
   await sql('INSERT INTO podcast_channels(id,feed,title,payload,created_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(feed) DO NOTHING',id,feed,saved.title,JSON.stringify(saved),user.id,saved.updated_at).run();
   const row=await sql('SELECT payload FROM podcast_channels WHERE feed=?',feed).first();return reply({channel:JSON.parse(row.payload)});
  }catch{return reply({error:'匯入失敗：請確認公開 HTTPS RSS 與集數內容'},400);}
 }
 if(path==='/admin/podcasts/update'&&req.method==='POST'){
  const data=await req.json(),row=await sql('SELECT * FROM podcast_channels WHERE id=?',data.id).first();if(!row)return reply({error:'找不到頻道'},404);
  if(data.error){await sql('UPDATE podcast_channels SET last_error=? WHERE id=?',String(data.error).slice(0,500),row.id).run();return reply({ok:true});}
  try{const saved=payload(data,row.id,row.feed);await sql('UPDATE podcast_channels SET title=?,payload=?,updated_at=?,last_error=NULL WHERE id=?',saved.title,JSON.stringify(saved),saved.updated_at,row.id).run();return reply({ok:true});}catch{return reply({error:'Podcast 集數資料格式錯誤'},400);}
 }
 return reply({error:'Method not allowed'},405);
}

export async function publicPodcastTranscript(value,fetcher=globalThis.fetch){
 const validate=v=>{const u=new URL(v),h=u.hostname.toLowerCase();if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||/^[\d.]+$/.test(h)||h.includes(':')||/(^|\.)(localhost|local|internal|test|invalid)$/.test(h))throw Error('逐字稿必須是公開 HTTPS 網址');return u;};
 let target=validate(value);const signal=AbortSignal.timeout(20000);
 for(let hop=0;hop<4;hop++){
  const r=await fetcher(target.href,{redirect:'manual',signal,headers:{Accept:'text/plain, text/vtt, application/json, application/x-subrip','User-Agent':'Mozilla/5.0'}});
  if(r.status>=300&&r.status<400){const location=r.headers.get('Location');if(!location)throw Error('逐字稿來源轉址缺少網址');target=validate(new URL(location,target).href);continue;}
  if(!r.ok)throw Error('逐字稿來源 HTTP '+r.status);
  const type=r.headers.get('Content-Type')||'text/plain';if(/html|audio|video|image/i.test(type))throw Error('來源不是可讀取的文字逐字稿');
  const reader=r.body?.getReader();if(!reader)throw Error('逐字稿來源沒有內容');const chunks=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1500000){await reader.cancel();throw Error('逐字稿超過 1.5 MB');}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}return {bytes,type};
 }throw Error('逐字稿來源轉址過多');
}
