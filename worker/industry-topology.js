import {INITIAL_TOPOLOGY,validateTopology,publishedTopology} from '../shared/industry-topology.js';
export async function topologyRoute(req,{sql,reply,flags={},management=false}){
 const path=new URL(req.url).pathname;
 if(management?path!=='/management/topology':!['/industry-topology','/industry-topology/news'].includes(path))return null;
 if(!management&&flags['market_watch.topology']===false)return reply({error:'產業關聯功能目前未開放'},403);
 if(!['GET',...(management?['PUT']:[])].includes(req.method))return reply({error:'Method not allowed'},405);
 await sql('CREATE TABLE IF NOT EXISTS industry_topology (id INTEGER PRIMARY KEY CHECK(id=1),document TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL)').run();
 if(req.method==='PUT'){
  const body=await req.json().catch(()=>null);let document;
  try{if(!Number.isInteger(body?.revision)||body.revision<0)throw Error('版本格式錯誤');document=validateTopology(body.document);}catch(e){return reply({error:e.message},400);}
  const encoded=JSON.stringify(document),now=Date.now();
  const row=body.revision===0?
   await sql('INSERT INTO industry_topology(id,document,revision,updated_at) VALUES(1,?,1,?) ON CONFLICT(id) DO NOTHING RETURNING revision',encoded,now).first():
   await sql('UPDATE industry_topology SET document=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=? RETURNING revision',encoded,now,body.revision).first();
  if(!row)return reply({error:'其他管理員已更新資料，請重新載入後再儲存。'},409);
  return reply({ok:true,revision:row.revision,updatedAt:now});
 }
 const stored=await sql('SELECT document,revision,updated_at FROM industry_topology WHERE id=1').first();
 const document=stored?JSON.parse(stored.document):INITIAL_TOPOLOGY;
 if(path==='/industry-topology/news'){
  if(flags['topology.events']===false)return reply({error:'關聯事件目前未開放'},403);
  const codes=[...new Set((new URL(req.url).searchParams.get('codes')||'').split(',').filter(Boolean))];
  const allowed=new Set(publishedTopology(document,flags).companies.map(c=>c.code));
  if(codes.length>50||codes.some(c=>!allowed.has(c)))return reply({error:'公司範圍格式錯誤或未開放，請縮小產業範圍。'},400);
  if(!codes.length)return reply({news:[]});
  const from=new Date(Date.now()-45*86400000).toISOString().slice(0,10),to=new Date().toISOString().slice(0,10);
  const news=await sql('SELECT company_code,title,url,source,news_date,published_at FROM news WHERE company_code IN ('+codes.map(()=>'?').join(',')+') AND news_date BETWEEN ? AND ? ORDER BY published_at DESC LIMIT 80',...codes,from,to).all();
  return reply({news:news.results});
 }
 return reply({document:management?document:publishedTopology(document,flags),revision:stored?.revision||0,updatedAt:stored?.updated_at||null});
}
