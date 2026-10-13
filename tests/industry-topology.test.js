import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {INITIAL_TOPOLOGY,validateTopology,publishedTopology,topologyNeighborhood} from '../shared/industry-topology.js';
import {managementRoute} from '../worker/management.js';
const copy=()=>structuredClone(INITIAL_TOPOLOGY);
const relation={id:'test-supplier',from:'company:US:NVDA',to:'company:2330',type:'supplier',label:'測試用候選關係',status:'pending',source:'https://example.com/evidence',date:'2026-10-14',enabled:true};
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../worker/migrations/0001_init.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO users VALUES(?,?)').run('user','test@example.com');
 const sql=(q,...args)=>({first:async()=>db.prepare(q).get(...args)||null,all:async()=>({results:db.prepare(q).all(...args)}),run:async()=>db.prepare(q).run(...args)});
 const reply=(data,status=200)=>Response.json(data,{status});
 const route=(path,{method='GET',body,token,user}={})=>managementRoute(new Request('https://test.example'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{ADMIN_USERNAME:'admin',ADMIN_PASSWORD:'pass'},{sql,reply,user,randomToken:()=>crypto.randomUUID()});
 return {db,sql,route};
}
test('seed has role assignments, both markets, no invented company supply contracts',()=>{
 const doc=validateTopology(copy());assert.equal(doc.chains.length,2);assert.ok(doc.companies.some(c=>c.code.startsWith('US:')));assert.ok(doc.companies.some(c=>c.code==='2330'));assert.ok(doc.relations.every(r=>r.type==='industry'));
 const nvda=doc.companies.find(c=>c.code==='US:NVDA');assert.equal(nvda.nodes.length,2);
});
test('reject dangling references, duplicate ids, unsafe URLs, mismatched relation endpoints and invalid dates',()=>{
 for(const modify of [d=>d.nodes.push({...d.nodes[0]}),d=>d.companies[0].nodes=['missing'],d=>d.nodes[0].source='javascript:alert(1)',d=>d.relations[0].date='2026-02-30',d=>d.relations.push({...relation,type:'industry'}),d=>d.companies[0].code='US:<svg>']){const doc=copy();modify(doc);assert.throws(()=>validateTopology(doc));}
});
test('publication removes inactive chains and companies, blocked markets and unpublished relation types',()=>{
 const doc=copy();doc.relations.push(relation);
 const flags={'markets.us':false,'topology.pending':false};const publicDoc=publishedTopology(doc,flags);assert.ok(publicDoc.companies.every(c=>!c.code.startsWith('US:')));assert.ok(publicDoc.relations.every(r=>r.status==='reviewed'));
 assert.ok(!publishedTopology(doc,{'topology.company_relations':false}).relations.some(r=>r.type!=='industry'));
 doc.chains[0].enabled=false;assert.ok(publishedTopology(doc).nodes.every(n=>n.chain!=='semiconductor'));
 assert.equal(publishedTopology(doc,{'market_watch.topology':false}).companies.length,0);
});
test('neighborhood handles cycles and limits traversal depth',()=>{
 const doc={relations:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'},{from:'c',to:'d'}]};assert.deepEqual([...topologyNeighborhood(doc,'a',1)].sort(),['a','b','c']);assert.equal(topologyNeighborhood(doc,'a',2).size,4);
});
test('admin auth, optimistic revision and persisted changes protect against stale and unauthorized edits',async()=>{
 const {db,route}=fixture();
 try{
  assert.equal((await route('/management/topology')).status,401);
  const {token}=await (await route('/admin/login',{method:'POST',body:{username:'admin',password:'pass'}})).json();
  const initial=await (await route('/management/topology',{token})).json();assert.equal(initial.revision,0);
  const doc=copy();doc.companies[0].enabled=false;doc.relations.push(relation);
  const saved=await route('/management/topology',{method:'PUT',token,body:{revision:0,document:doc}});assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
  assert.equal((await route('/management/topology',{method:'PUT',token,body:{revision:0,document:initial.document}})).status,409);
  assert.equal((await route('/management/topology',{method:'PUT',token,body:{revision:1,document:doc}})).status,200);
  assert.equal((await (await route('/management/topology',{token})).json()).revision,2);
  assert.ok(!(await (await route('/industry-topology')).json()).document.companies.some(c=>c.code==='2330'));
  assert.equal((await route('/industry-topology',{method:'PUT',body:{document:doc}})).status,405);
  await route('/admin/logout',{method:'POST',token});assert.equal((await route('/management/topology',{token})).status,401);
 }finally{db.close();}
});
test('global switches and personal overrides enforce API visibility and respect market flags',async()=>{
 const {db,route}=fixture();try{
  const {token}=await (await route('/admin/login',{method:'POST',body:{username:'admin',password:'pass'}})).json();
  await route('/management/features',{method:'PUT',token,body:{features:[{key:'market_watch.topology',enabled:false},{key:'markets.us',enabled:false}]}});
  assert.equal((await route('/industry-topology')).status,403);
  await route('/management/users/user/features',{method:'PUT',token,body:{key:'market_watch.topology',enabled:true}});
  const data=await (await route('/industry-topology',{user:{id:'user'}})).json();assert.ok(data.document.companies.every(c=>!c.code.startsWith('US:')));
 }finally{db.close();}
});
test('event queries bound to visible companies and recent existing news, with independent feature gate',async()=>{
 const {db,route,sql}=fixture();try{
  const today=new Date().toISOString().slice(0,10);
  await sql('INSERT INTO companies(code,name,full_name,market) VALUES(?,?,?,?)','2330','台積電','台灣積體電路製造股份有限公司','TW').run();
  await sql('INSERT INTO news(company_code,title,url,source,published_at,news_date) VALUES(?,?,?,?,?,?)','2330','Recent','https://example.com/news','test',today,today).run();
  await sql('INSERT INTO news(company_code,title,url,source,published_at,news_date) VALUES(?,?,?,?,?,?)','2330','Old','https://example.com/old','test','2020-01-01','2020-01-01').run();
  const recent=await (await route('/industry-topology/news?codes=2330')).json();assert.equal(recent.news.length,1);assert.equal(recent.news[0].title,'Recent');
  assert.equal((await route('/industry-topology/news?codes=9999')).status,400);
  const {token}=await (await route('/admin/login',{method:'POST',body:{username:'admin',password:'pass'}})).json();
  await route('/management/features',{method:'PUT',token,body:{features:[{key:'topology.events',enabled:false}]}});
  assert.equal((await route('/industry-topology/news?codes=2330')).status,403);
 }finally{db.close();}
});
test('Worker entry authenticates personal topology requests before applying overrides',async()=>{
 const {db,sql,route}=fixture();try{
  const {default:worker}=await import('../worker/index.js');
  const env={APP_URL:'https://example.com/',DB:{prepare:q=>({bind:(...args)=>sql(q,...args)})}};
  const token='normal-user-token',hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  await sql('INSERT INTO sessions VALUES(?,?,?)',hash,'user',Date.now()+60000).run();
  const {token:admin}=await (await route('/admin/login',{method:'POST',body:{username:'admin',password:'pass'}})).json();
  await route('/management/features',{method:'PUT',token:admin,body:{features:[{key:'market_watch.topology',enabled:false}]}});
  await route('/management/users/user/features',{method:'PUT',token:admin,body:{key:'market_watch.topology',enabled:true}});
  const req=token=>new Request('https://worker.example/industry-topology',{headers:token?{Authorization:'Bearer '+token}:{}});
  assert.equal((await worker.fetch(req(),env)).status,403);
  assert.equal((await worker.fetch(req('invalid'),env)).status,401);
  const personal=await worker.fetch(req(token),env);assert.equal(personal.status,200);assert.equal((await personal.json()).document.chains.length,2);
 }finally{db.close();}
});
