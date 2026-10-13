import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {build} from 'esbuild';
import {INITIAL_TOPOLOGY} from '../shared/industry-topology.js';
const result=await build({entryPoints:[new URL('../src/industry-topology.js',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',loader:{'.css':'empty'},plugins:[{name:'stubs',setup(b){b.onResolve({filter:/^\.\/api\.js$/},()=>({path:'api',namespace:'stub'}));b.onResolve({filter:/^\.\/podcast-mentions\.js$/},()=>({path:'mentions',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path==='api'?'export const remoteAPI=(...args)=>globalThis.topologyRequest(...args);':'export const podcastMentions=()=>[];'}));}}]});
const ui=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const flush=()=>new Promise(r=>setImmediate(r));
function dom(){const {document}=parseHTML('<html><body><section id="host"></section></body></html>');return document.querySelector('#host');}
test('filters cross-market companies, tracked-only and node searches',()=>{
 const base={chain:'semiconductor',market:'ALL',tracked:false,pending:false,query:''};
 assert.ok(ui.topologyView(INITIAL_TOPOLOGY,base,[]).companies.some(c=>c.code==='US:NVDA'));
 assert.equal(ui.topologyView(INITIAL_TOPOLOGY,{...base,tracked:true},[{code:'2330'}]).companies.length,1);
 assert.equal(ui.topologyView(INITIAL_TOPOLOGY,{...base,query:'NVDA'},[]).companies[0].code,'US:NVDA');
 assert.ok(ui.topologyView(INITIAL_TOPOLOGY,{...base,market:'TW'},[]).companies.every(c=>!c.code.startsWith('US:')));
});
test('interactive diagram renders arrows, evidence and filters without automatic AI calls',async()=>{
 const host=dom();let analyses=0;ui.mountTopology(host,{owner:'ui-user',configured:false,tracked:[{code:'2330'}],flags:{},onChart(){},onAnalysis(){analyses++;}});await flush();
 assert.ok(host.querySelector('.topology-svg'));assert.equal(analyses,0);
 host.querySelector('[data-topology-edge]').onclick();assert.ok(host.querySelector('.topology-evidence a').getAttribute('href').startsWith('https:'));
 const toggle=host.querySelector('#topology-tracked');toggle.checked=true;toggle.onchange({target:toggle});assert.equal(host.querySelectorAll('.topology-company').length,1);
 assert.match(host.querySelector('.topology-company').textContent,/台積電/);
});
test('pending load completes into the latest host, and owner changes discard prior data',async()=>{
 let complete;globalThis.topologyRequest=()=>new Promise(r=>complete=r);
 const first=dom(),context={owner:'async-user',configured:true,tracked:[],flags:{'topology.events':false},onChart(){}};
 ui.mountTopology(first,context);first.remove();const second=dom();ui.mountTopology(second,context);
 complete({document:INITIAL_TOPOLOGY,revision:2});await flush();assert.ok(second.querySelector('.topology-svg'));assert.match(second.textContent,/版本 2/);
 const next=dom();ui.mountTopology(next,{...context,owner:'other-user'});assert.ok(!next.querySelector('.topology-svg'));
 complete({document:INITIAL_TOPOLOGY,revision:3});await flush();assert.ok(next.querySelector('.topology-svg'));
});
test('disabled subfeatures remove data and prevent hidden-company disclosure',async()=>{
 const host=dom();ui.mountTopology(host,{owner:'restricted-user',configured:false,tracked:[],flags:{'markets.us':false,'topology.events':false,'topology.company_relations':false,'topology.pending':false,'stock_tools.candles':false},onChart(){}});await flush();
 assert.ok(!host.querySelector('.topology-events'));assert.ok(!host.textContent.includes('NVIDIA'));
 assert.ok([...host.querySelectorAll('[data-topology-chart]')].every(b=>b.hasAttribute('hidden')));
});
test('AI prompt grounds claims in sources and distinguishes inference',()=>{
 const prompt=ui.topologyAnalysisPrompt({chain:{label:'半導體'},nodes:INITIAL_TOPOLOGY.nodes,companies:INITIAL_TOPOLOGY.companies,relations:INITIAL_TOPOLOGY.relations},[{company_code:'2330',title:'A'},{company_code:'US:NVDA',title:'B'}],['2330']);
 assert.match(prompt,/不可捏造/);assert.match(prompt,/https:\/\/www.tsmc.com/);assert.ok(!prompt.includes('"title": "B"'));
});
test('selecting a company locates its industry roles and depth choice retains selection',async()=>{
 const host=dom();ui.mountTopology(host,{owner:'depth-user',configured:false,tracked:[],flags:{'topology.events':false},onChart(){}});await flush();
 const c=host.querySelector('[data-topology-company="2330"]');c.onclick();assert.ok(host.querySelector('.topology-node.selected'));
 const select=host.querySelector('#topology-depth');Object.defineProperty(select,'value',{value:'2',configurable:true});select.onchange({target:select});assert.ok(host.querySelector('.topology-node.selected'));assert.match(host.textContent,/周邊產業環節公司/);
});
