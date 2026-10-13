import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createDisclosureState} from '../src/disclosure-state.js';

test('background rerenders keep a manually opened or closed movement panel',()=>{
 const {document}=parseHTML('<main></main>'),root=document.querySelector('main');
 const state=createDisclosureState('.movement-overview-collapsible');
 const render=(owner='alice')=>{
  state.capture(root,owner);
  root.innerHTML=`<details class="movement-overview-collapsible" ${state.open?'open':''}><summary>異動追查</summary><p>行情</p></details>`;
 };
 render();
 assert.equal(state.open,false);
 root.querySelector('details').setAttribute('open','');
 // Rerender immediately, without waiting for the asynchronous native toggle event.
 for(let i=0;i<4;i++){render();assert.ok(root.querySelector('details').hasAttribute('open'));}
 root.querySelector('details').removeAttribute('open');
 render();assert.ok(!root.querySelector('details').hasAttribute('open'));
 root.querySelector('details').setAttribute('open','');
 render('bob');assert.ok(!root.querySelector('details').hasAttribute('open'));
 root.querySelector('details').setAttribute('open','');
 render();assert.ok(!root.querySelector('details').hasAttribute('open'));
});

test('main captures the disclosure before rebuilding the app and renders saved state',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const render=source.slice(source.indexOf('function render(){'));
 assert.ok(render.indexOf('movementDisclosure.capture(app,state.user?.id)')<render.indexOf('app.innerHTML='));
 assert.ok(source.includes('class="movement-overview-collapsible" ${movementDisclosure.open?\'open\':\'\'}'));
});
