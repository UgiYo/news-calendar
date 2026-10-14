import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {candlePanel} from '../src/candles.js';import {FEATURE_SELECTORS} from '../src/feature-policy.js';
for(const code of ['2330','US:NVDA'])test(code+' puts restoration last in timeframe toolbar and checkbox immediately beside support text',()=>{
 const {document}=parseHTML('<html><body>'+candlePanel({code,prices:[]})+'</body></html>');
 const toggle=document.querySelector('#toggle-adjusted-candles'),toolbar=document.querySelector('[data-candle-period="day"]').parentElement;
 assert.equal(toggle.closest('.candle-tabs'),toolbar);assert.equal(toolbar.lastElementChild.className,'candle-adjustment-control');assert.equal(toggle.nextElementSibling.textContent,'還原 K');
 assert.ok([...toolbar.children].indexOf(document.querySelector('#reload-candles'))<[...toolbar.children].indexOf(toggle.closest('.candle-adjustment-control')));
 const support=document.querySelector('#toggle-support-resistance');assert.equal(support.nextElementSibling.tagName,'SPAN');assert.match(support.nextElementSibling.textContent,/支撐／壓力/);assert.ok(support.parentElement.classList.contains('candle-checkbox'));
 assert.equal(document.querySelector('.candle-panel').children[1].className,'ma-controls');
 assert.ok(FEATURE_SELECTORS['stock_tools.adjusted_candles'].includes('.candle-adjustment-note'));
});
