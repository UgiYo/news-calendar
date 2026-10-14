import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {parseHTML} from 'linkedom';
import {DEFAULT_SUBSTACK,substackPublication,substackMentions,substackChunks,substackPrompt} from '../shared/substack.js';
import {normalizeSubstackArticle,substackRoute} from '../worker/substack.js';
import {validAccountResult} from '../worker/account-results.js';
import {decorateSubstackSummary} from '../src/substack-mentions.js';

test('verified profile resolves publication, while untrusted destinations are rejected',()=>{
 assert.equal(substackPublication('https://substack.com/@unclestocknotes?utm_source=share'),DEFAULT_SUBSTACK.url);
 assert.equal(substackPublication(DEFAULT_SUBSTACK.url+'/p/post?utm_source=share'),DEFAULT_SUBSTACK.url);
 for(const url of ['http://x.substack.com','https://substack.com/@unknown','https://x.substack.com.evil.test','https://user:secret@x.substack.com','https://127.0.0.1'])assert.throws(()=>substackPublication(url));
});
test('original paragraphs match US aliases, exclude Taiwan and ambiguous tickers, and distinguish mention from stance',()=>{
 const text='AI improves productivity. We are ON track.\nNVIDIA 與 $MSFT 被提及，但作者沒有表示持有。\n$ZZZZ is only a hypothetical symbol.\n'+'背景 '.repeat(400)+'$NVDA 看法放在長段落最後。';
 const rows=substackMentions(text);
 assert.ok(rows.some(c=>c.code==='US:NVDA'));assert.ok(rows.some(c=>c.code==='US:MSFT'));assert.ok(!rows.some(c=>['US:ON','US:AI','US:ARE'].includes(c.code)));
 assert.match(rows.find(c=>c.code==='US:ZZZZ').status,/待確認/);assert.match(rows.find(c=>c.code==='US:NVDA').evidence.at(-1).text,/NVDA/);
 assert.equal(substackMentions('台積電 2330',[{code:'2330',name:'台積電'}]).length,0);
 assert.ok(rows.every(c=>!c.status.includes('看多')));
});
test('article provenance and US date are checked and paywall classification is conservative',()=>{
 const a=normalizeSubstackArticle({url:DEFAULT_SUBSTACK.url+'/p/abc?utm_source=share',title:'NVDA',published_at:'2026-10-14T01:00:00Z',access:'paid',text:'Only a subtitle'},DEFAULT_SUBSTACK);
 assert.equal(a.date,'2026-10-13');assert.equal(a.access,'preview');assert.equal(a.url,DEFAULT_SUBSTACK.url+'/p/abc');assert.equal(a.mentions.length,0); // title alone is not original-body evidence
 assert.throws(()=>normalizeSubstackArticle({...a,url:'https://evil.test/p/abc'},DEFAULT_SUBSTACK));
 assert.throws(()=>normalizeSubstackArticle({...a,published_at:'bad'},DEFAULT_SUBSTACK));
});
test('long articles are split without losing text or global paragraph numbers',()=>{
 const text='第一段 NVIDIA\n'+('長段落 '.repeat(9000))+'\n第三段 $MSFT';const chunks=substackChunks(text);
 assert.ok(chunks.length>2);assert.ok(chunks.every(c=>c.text.length<=16001));
 assert.equal(chunks.map(c=>c.text.replace(/\s/g,'')).join(''),text.replace(/\s/g,''));
 assert.match(chunks.at(-1).numbered_text,/段落 3/);const prompt=substackPrompt({title:'文',author_title:'作者',date:'2026-10-13',url:DEFAULT_SUBSTACK.url+'/p/abc',access:'preview',...chunks.at(-1)});
 assert.match(prompt,/立場不明/);assert.match(prompt,/不能把提及當成推薦或持有/);assert.match(prompt,/段落 3/);assert.match(prompt,/公開預覽/);
});
test('shared archive upserts, exposes metadata separately, preserves failure state and enforces admin feature controls',async()=>{
 const db=new DatabaseSync(':memory:');const sql=(q,...args)=>({first:async()=>db.prepare(q).get(...args)||null,all:async()=>({results:db.prepare(q).all(...args)}),run:async()=>db.prepare(q).run(...args)});
 const call=async(path,method='GET',body,extra={})=>substackRoute(new Request('https://api.test'+path,{method,...(body?{body:JSON.stringify(body)}:{})}),{sql,reply:(data,status=200)=>({data,status}),user:{id:'alice'},dispatch:async()=>true,env:{},...extra});
 assert.equal((await call('/substack/authors','GET',null,{user:null})).status,401);
 const authors=(await call('/substack/authors')).data.authors;assert.equal(authors.length,1);
 const data={author_id:DEFAULT_SUBSTACK.id,articles:[{url:DEFAULT_SUBSTACK.url+'/p/abc',title:'文章',text:'NVIDIA 原文',access:'public',published_at:'2026-10-14T01:00:00Z'}],archive_offset:1,archive_complete:true};
 await call('/admin/substack/update','POST',data,{admin:true});await call('/admin/substack/update','POST',data,{admin:true});
 const listing=(await call('/substack/articles')).data;assert.equal(listing.articles.length,1);assert.equal(listing.articles[0].text,undefined);assert.equal(listing.articles[0].mentions[0].code,'US:NVDA');
 const detail=(await call('/substack/article?id='+encodeURIComponent(listing.articles[0].id))).data.article;assert.equal(detail.text,'NVIDIA 原文');
 assert.equal((await call('/substack/articles','GET',null,{flags:{'news_calendar.substack':false}})).status,403);
 assert.equal((await call('/substack/authors','POST',{url:'https://example.substack.com'},{flags:{'news_calendar.substack_import':false}})).status,403);
 await call('/admin/substack/update','POST',{author_id:DEFAULT_SUBSTACK.id,error:'Source unavailable'},{admin:true});
 const failed=(await call('/substack/authors')).data.authors[0];assert.equal(failed.archive_offset,1);assert.equal(failed.archive_complete,1);assert.match(failed.last_error,/unavailable/);assert.ok(failed.latest_published_at);
 assert.equal((await call('/substack/articles?offset=-1')).status,400);db.close();
});
test('Substack results use the same private account schema and source paragraph navigation',()=>{
 const row={id:'substack:a',title:'文章',kind:'substack',date:'2026-10-13',updated_at:'2026-10-14T00:00:00Z',answer:'作者觀點',text:'NVIDIA 是觀察標的。',partial:true,failures:[],episode:{id:'a',url:DEFAULT_SUBSTACK.url+'/p/a',channel_name:'作者'}};
 assert.ok(validAccountResult(row));assert.ok(!validAccountResult({...row,owner:'bob'}));
 const {document}=parseHTML('<html><body><article>作者觀點</article></body></html>');const previous=globalThis.document;globalThis.document=document;
 try{const body=document.querySelector('article');decorateSubstackSummary(body,row,'US:NVDA');assert.ok(body.querySelector('[data-substack-evidence="US:NVDA"]').open);assert.match(body.textContent,/公開預覽/);assert.match(body.textContent,/觀察標的/);}finally{globalThis.document=previous;}
});
