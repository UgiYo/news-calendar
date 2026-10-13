// Industry roles are separate from documented company-to-company relationships.
const node=(id,chain,label,level,source)=>({id,chain,label,level,source,enabled:true});
const company=(code,name,nodes,source)=>({code,name,nodes,source,enabled:true});
export const INITIAL_TOPOLOGY={
 chains:[{id:'semiconductor',label:'半導體',enabled:true},{id:'ai-server',label:'AI 伺服器',enabled:true}],
 nodes:[
  node('equipment','semiconductor','設備與材料',0,'https://ic.tpex.org.tw/'),
  node('design','semiconductor','晶片設計',0,'https://ic.tpex.org.tw/'),
  node('foundry','semiconductor','晶圓製造',1,'https://ic.tpex.org.tw/'),
  node('packaging','semiconductor','封裝與測試',2,'https://ic.tpex.org.tw/'),
  node('chips','ai-server','運算晶片',0,'https://ic.tpex.org.tw/'),
  node('components','ai-server','電源與零組件',0,'https://ic.tpex.org.tw/'),
  node('assembly','ai-server','伺服器組裝',1,'https://ic.tpex.org.tw/'),
  node('cloud','ai-server','雲端與終端應用',2,'https://ic.tpex.org.tw/')
 ],
 companies:[
  company('2330','台積電',['foundry'],'https://www.tsmc.com/'),
  company('2303','聯電',['foundry'],'https://www.umc.com/'),
  company('2454','聯發科',['design'],'https://www.mediatek.com/'),
  company('3711','日月光投控',['packaging'],'https://www.aseglobal.com/'),
  company('2308','台達電',['components'],'https://www.deltaww.com/'),
  company('2382','廣達',['assembly'],'https://www.quantatw.com/'),
  company('3231','緯創',['assembly'],'https://www.wistron.com/'),
  company('6669','緯穎',['assembly'],'https://www.wiwynn.com/'),
  company('US:NVDA','輝達 NVIDIA',['design','chips'],'https://www.nvidia.com/'),
  company('US:AMD','AMD',['design','chips'],'https://www.amd.com/'),
  company('US:AMAT','Applied Materials',['equipment'],'https://www.appliedmaterials.com/'),
  company('US:ASML','ASML',['equipment'],'https://www.asml.com/'),
  company('US:MU','Micron',['foundry','components'],'https://www.micron.com/'),
  company('US:DELL','Dell',['assembly'],'https://www.dell.com/'),
  company('US:HPE','HPE',['assembly'],'https://www.hpe.com/'),
  company('US:MSFT','Microsoft',['cloud'],'https://www.microsoft.com/'),
  company('US:AMZN','Amazon',['cloud'],'https://aws.amazon.com/'),
  company('US:GOOGL','Alphabet',['cloud'],'https://cloud.google.com/')
 ],
 relations:[['equipment','foundry'],['design','foundry'],['foundry','packaging'],['chips','assembly'],['components','assembly'],['assembly','cloud']].map(([from,to],i)=>({id:'flow-'+i,from,to,type:'industry',label:'產品／服務流向',status:'reviewed',source:'https://ic.tpex.org.tw/',date:'2026-10-14',enabled:true}))
};
export const RELATION_TYPES={industry:'產業環節',supplier:'供應／客戶',partner:'合作',competitor:'競爭'};
export const endpointCompany=code=>'company:'+code;
export function safeTopologyURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function validateTopology(doc){
 if(!doc||JSON.stringify(doc).length>250000)throw Error('資料過大或格式錯誤');
 for(const [key,max] of [['chains',30],['nodes',300],['companies',1500],['relations',2500]])if(!Array.isArray(doc[key])||doc[key].length>max)throw Error(key+' 格式錯誤或超過上限');
 const text=(x,max=200)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
 const id=x=>text(x,80)&&/^[a-zA-Z0-9:_-]+$/.test(x);
 const unique=(rows,key)=>{if(new Set(rows.map(r=>r[key])).size!==rows.length)throw Error('重複 '+key);};
 for(const k of ['chains','nodes','relations'])unique(doc[k],'id');unique(doc.companies,'code');
 const chains=new Set(doc.chains.map(c=>c.id)),nodes=new Set(doc.nodes.map(n=>n.id));
 for(const c of doc.chains)if(!id(c.id)||!text(c.label)||typeof c.enabled!=='boolean')throw Error('產業鏈格式錯誤');
 for(const n of doc.nodes)if(!id(n.id)||n.id.startsWith('company:')||!chains.has(n.chain)||!text(n.label)||!Number.isInteger(n.level)||n.level<0||n.level>8||typeof n.enabled!=='boolean'||!safeTopologyURL(n.source))throw Error('產業節點或來源格式錯誤');
 for(const c of doc.companies)if(!/^(?:\d{4,6}|US:[A-Z][A-Z0-9.-]{0,14})$/.test(c.code)||!text(c.name)||!Array.isArray(c.nodes)||!c.nodes.length||new Set(c.nodes).size!==c.nodes.length||c.nodes.some(n=>!nodes.has(n))||typeof c.enabled!=='boolean'||!safeTopologyURL(c.source))throw Error('公司、所屬環節或來源格式錯誤');
 const endpoints=new Set([...nodes,...doc.companies.map(c=>endpointCompany(c.code))]);
 for(const r of doc.relations){
  if(!id(r.id)||!endpoints.has(r.from)||!endpoints.has(r.to)||r.from===r.to||!Object.hasOwn(RELATION_TYPES,r.type)||!['reviewed','pending'].includes(r.status)||!text(r.label)||typeof r.enabled!=='boolean'||!safeTopologyURL(r.source)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||Number.isNaN(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date)throw Error('關係、來源或日期格式錯誤');
  if(r.type==='industry'&&(r.from.startsWith('company:')||r.to.startsWith('company:')))throw Error('產業環節關係只能連接產業節點');
  if(r.type!=='industry'&&(!r.from.startsWith('company:')||!r.to.startsWith('company:')))throw Error('公司關係只能連接公司');
 }
 // Only retain declared fields; prevent hidden metadata from entering public output.
 return Object.fromEntries(Object.entries({chains:['id','label','enabled'],nodes:['id','chain','label','level','source','enabled'],companies:['code','name','nodes','source','enabled'],relations:['id','from','to','type','label','status','source','date','enabled']}).map(([key,fields])=>[key,doc[key].map(row=>Object.fromEntries(fields.map(f=>[f,row[f]])))]));
}
export function publishedTopology(doc,flags={}){
 if(flags['market_watch.topology']===false)return {chains:[],nodes:[],companies:[],relations:[]};
 const chains=doc.chains.filter(c=>c.enabled),chainIds=new Set(chains.map(c=>c.id));
 const nodes=doc.nodes.filter(n=>n.enabled&&chainIds.has(n.chain)),nodeIds=new Set(nodes.map(n=>n.id));
 const companies=doc.companies.filter(c=>c.enabled&&flags['markets.'+(c.code.startsWith('US:')?'us':'tw')]!==false).map(c=>({...c,nodes:c.nodes.filter(n=>nodeIds.has(n))})).filter(c=>c.nodes.length);
 const endpoints=new Set([...nodeIds,...companies.map(c=>endpointCompany(c.code))]);
 const relations=doc.relations.filter(r=>r.enabled&&endpoints.has(r.from)&&endpoints.has(r.to)&&(r.status==='reviewed'||flags['topology.pending']!==false)&&(r.type==='industry'||flags['topology.company_relations']!==false));
 return {chains,nodes,companies,relations};
}
export function topologyNeighborhood(doc,start,depth=1){
 const seen=new Set([start]);let frontier=[start];
 for(let i=0;i<depth;i++){const next=[];for(const r of doc.relations)if(frontier.includes(r.from)||frontier.includes(r.to))for(const id of [r.from,r.to])if(!seen.has(id)){seen.add(id);next.push(id);}frontier=next;}
 return seen;
}
