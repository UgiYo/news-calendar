import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {mountAdminTopology,resetAdminTopology} from '../src/admin-topology.js';
import {INITIAL_TOPOLOGY} from '../shared/industry-topology.js';
const flush=()=>new Promise(r=>setImmediate(r));
const host=()=>parseHTML('<html><body><section id="editor"></section></body></html>').document.querySelector('#editor');
test('admin edits, saves and receives concrete success feedback with revision',async()=>{
 resetAdminTopology();const h=host();let saved,alerts=[];globalThis.window={alert:s=>alerts.push(s)};
 const request=async(path,options)=>{if(options){saved=options.body;return {revision:1};}return {revision:0,document:structuredClone(INITIAL_TOPOLOGY)};};
 mountAdminTopology(h,request);await flush();const el=h.querySelector('[data-collection="companies"][data-index="0"][data-field="enabled"]');el.checked=false;el.oninput();assert.equal(h.querySelector('#save-topology').disabled,false);
 await h.querySelector('#save-topology').onclick();assert.equal(saved.revision,0);assert.equal(saved.document.companies[0].enabled,false);assert.match(alerts[0],/已保存/);assert.equal(h.querySelector('#save-topology').disabled,true);
});
test('admin conflict keeps draft and explains reload without false success',async()=>{
 resetAdminTopology();const h=host();const request=async(path,options)=>{if(options)throw Error('其他管理員已更新資料，請重新載入後再儲存。');return {revision:0,document:structuredClone(INITIAL_TOPOLOGY)};};
 mountAdminTopology(h,request);await flush();const el=h.querySelector('[data-collection="companies"][data-index="0"][data-field="name"]');el.value='台積電新名稱';el.oninput();await h.querySelector('#save-topology').onclick();assert.match(h.textContent,/其他管理員/);assert.equal(h.querySelector('[data-collection="companies"][data-index="0"][data-field="name"]').value,'台積電新名稱');
});
test('removing a chain cascades draft memberships and connected relations safely',async()=>{
 resetAdminTopology();const h=host();let saved;const request=async(path,options)=>{if(options){saved=options.body.document;return {revision:1};}return {revision:0,document:structuredClone(INITIAL_TOPOLOGY)};};mountAdminTopology(h,request);await flush();h.querySelector('[data-topology-remove][data-collection="chains"]').onclick();await h.querySelector('#save-topology').onclick();assert.equal(saved.chains.length,1);assert.ok(saved.nodes.every(n=>n.chain==='ai-server'));assert.ok(saved.companies.every(c=>c.nodes.length));assert.ok(!saved.relations.some(r=>r.from==='foundry'));
});
