import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {parseHTML} from 'linkedom';
test('admin saves show a popup and keep the success message; failed saves do not report success',async()=>{
 const {window,document}=parseHTML('<html><body><div id="app"></div></body></html>');
 globalThis.window=window;globalThis.document=document;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value||'';},set(value){this._value=value;}});
 globalThis.sessionStorage={getItem:()=> 'admin-token',setItem(){},removeItem(){}};
 const notices=[],model={tree:[{key:'ai_tools.assistant',label:'AI 小助手'}],features:{'ai_tools.assistant':true},users:[{id:'alice',email:'alice@example.com'}],overrides:[]};
 window.alert=text=>notices.push(text);let fail=false;
 globalThis.fetch=async(url,options)=>{
  if(options.method==='PUT'&&fail)return Response.json({error:'儲存失敗'},{status:500});
  return Response.json(options.method==='GET'?model:{ok:true});
 };
 const result=await build({stdin:{contents:readFileSync('src/admin.js','utf8'),resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env':JSON.stringify({VITE_WORKER_API_URL:'https://api.test'})}});
 await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const wait=async predicate=>{for(let i=0;i<30&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(predicate());};
 await wait(()=>document.querySelector('#save-global'));
 document.querySelector('#save-global').click();await wait(()=>notices.length===1);
 assert.match(document.querySelector('.status').textContent,/全站設定已保存/);
 const select=document.querySelector('#user-tree [data-feature]');select.value='false';await select.onchange();
 assert.equal(notices.length,2);assert.match(notices[1],/個人功能設定已保存/);
 fail=true;document.querySelector('#save-global').click();await wait(()=>document.querySelector('.status').textContent==='儲存失敗');
 assert.equal(notices.length,2);assert.equal(document.querySelector('#save-global').hasAttribute('disabled'),false);
});
