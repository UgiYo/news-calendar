import {api} from './api.js';
import {isUS} from '../shared/markets.js';
import {DEFAULT_SUBSTACK,substackMentions,substackPrompt,substackChunks} from '../shared/substack.js';
import {currentAISettings,requestAI} from './local-ai.js';
import {requireAISession} from './ai-auth.js';
import {companyMode} from './ai-privacy.js';
import {runResultJob,resultRecords,openResultsCenter} from './ai-results.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let owner=null,authors=[],articles=[],loading=false,error='',message='',authorFilter='',stockFilter='',dateOnly=false,query='',limit=30,context={},onChange=()=>{},loaded=false,generation=0;
export function substackDateArticles(date,companies=[],selected=''){
 if(context.market!=='US'||context.flags?.['news_calendar.substack']===false)return [];
 const codes=new Set(companies.filter(c=>isUS(c.code)&&(!selected||selected===c.code)).map(c=>c.code));
 return articles.filter(a=>a.date===date&&(!authorFilter||a.author_id===authorFilter)&&(a.mentions||[]).some(c=>codes.has(c.code)));
}
function card(a,tracked){
 const codes=new Set(tracked.map(c=>c.code));
 return `<article class="substack-card"><strong>${esc(a.title)}</strong><small>${esc(a.author_title)} · ${esc(a.date)} 美東 · ${a.access==='public'?'公開內文':'公開預覽／部分內容'}</small><div class="stock-actions">${(a.mentions||[]).map(c=>`<button data-substack-open="${esc(a.id)}" data-substack-code="${esc(c.code)}">${codes.has(c.code)?'★ ':''}${esc(c.code.replace('US:',''))} ${esc(c.name)}</button>`).join('')}</div><div class="stock-actions"><button data-substack-open="${esc(a.id)}">查看標的與作者看法</button><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">原文</a></div></article>`;
}
export function substackDayPanel(date,companies,selected){
 const rows=substackDateArticles(date,companies,selected);
 return rows.length?`<section class="substack-day"><h3>★ Substack 提及追蹤股（${rows.length} 篇）</h3>${rows.map(a=>card(a,companies)).join('')}</section>`:'';
}
function reset(next){owner=next;generation++;authors=[];articles=[];loaded=false;loading=false;error='';message='';authorFilter='';stockFilter='';query='';limit=30;document.querySelector('#substack-article-dialog')?.closest('.modal-backdrop')?.remove();}
async function load(){
 if(loading||!owner)return;loading=true;error='';const who=owner,version=generation;onChange();
 try{const data=await api('/substack/authors');let rows=[],offset=0;
  while(true){const page=await api('/substack/articles?offset='+offset);rows.push(...page.articles);if(who!==owner||version!==generation)return;if(!page.has_more)break;if(page.next_offset<=offset)throw Error('文章分頁未前進');offset=page.next_offset;}
  if(who!==owner||version!==generation)return;authors=data.authors;articles=[...new Map(rows.map(a=>[a.id,a])).values()];loaded=true;
 }catch(e){if(who===owner&&version===generation)error=e.message;}finally{if(who===owner&&version===generation){loading=false;onChange();}}
}
export function setSubstackContext(options){context=options;if(owner!==(options.owner||null))reset(options.owner||null);}
export function mountSubstack(host,options,changed){
 setSubstackContext(options);onChange=changed;
 if(!host)return;
 if(options.market!=='US'||options.flags?.['news_calendar.substack']===false){host.hidden=true;return;}host.hidden=false;
 const rows=articles.filter(a=>(!authorFilter||a.author_id===authorFilter)&&(!dateOnly||a.date===options.date)&&(!(options.selected||stockFilter)||(a.mentions||[]).some(c=>c.code===(options.selected||stockFilter)))&&(!query||[a.title,a.author_title,...(a.mentions||[]).map(c=>c.name+' '+c.code)].join(' ').toLowerCase().includes(query.toLowerCase())));
 const stocks=[...new Map(articles.filter(a=>!authorFilter||a.author_id===authorFilter).flatMap(a=>a.mentions||[]).map(c=>[c.code,c])).values()].sort((a,b)=>a.code.localeCompare(b.code));
 host.innerHTML=`<section class="substack-panel"><div class="modal-heading"><h2>Substack 作者與美股觀點</h2><button data-substack-reload ${loading||!owner?'disabled':''}>${loading?'載入中…':'重新載入文章'}</button></div><p>★ 為你追蹤的美股。原文提及與作者立場分開呈現；匯入不消耗 AI Token，生成整理使用你的 AI 設定。</p><p role="status">${esc(error||message||(!owner?'請先登入以查看作者文章':`${articles.length} 篇已匯入文章`))}</p><div class="substack-filters"><label>作者<select data-substack-author><option value="">全部作者</option>${authors.map(a=>`<option value="${esc(a.id)}" ${a.id===authorFilter?'selected':''}>${esc(a.title)}</option>`).join('')}</select></label><label>標的<select data-substack-stock ${options.selected?'disabled':''}><option value="">全部標的</option>${stocks.map(c=>`<option value="${esc(c.code)}" ${c.code===(options.selected||stockFilter)?'selected':''}>${esc(c.code.replace('US:',''))} ${esc(c.name)}</option>`).join('')}</select></label><label>標題／標的搜尋<input data-substack-search value="${esc(query)}" maxlength="100" placeholder="例如 NVDA、輝達"></label><label class="ai-check"><input type="checkbox" data-substack-date ${dateOnly?'checked':''}>只看選定日期 ${esc(options.date)}</label></div><div class="stock-actions"><button data-substack-refresh ${!owner?'disabled':''}>更新作者文章</button></div>${options.flags?.['news_calendar.substack_import']===false?'':`<details class="substack-import"><summary>新增作者／匯入全部歷史文章</summary><form data-substack-import><label>Substack 刊物網址<input name="url" type="url" required value="${DEFAULT_SUBSTACK.url}" placeholder="https://作者.substack.com"></label><label>作者顯示名稱<input name="title" maxlength="500" placeholder="${esc(DEFAULT_SUBSTACK.title)}"></label><button ${!owner?'disabled':''}>追蹤作者並匯入</button></form></details>`}<details><summary>作者更新狀態</summary>${authors.map(a=>`<p>${esc(a.title)} · ${a.archive_complete?'歷史匯入完成':'歷史匯入進行中，已處理 '+a.archive_offset+' 筆'} · ${esc(a.updated_at||'尚未更新')}${a.last_error?' · '+esc(a.last_error):''}</p>`).join('')}</details><p>顯示 ${Math.min(limit,rows.length)}／${rows.length} 篇${options.selected?' · 已套用左側選定個股':''}</p><div class="substack-articles">${rows.slice(0,limit).map(a=>card(a,options.companies)).join('')||'<p class="empty">尚無符合條件的文章。可更新文章或調整作者／日期／標的篩選。</p>'}</div>${rows.length>limit?'<button data-substack-more>顯示更多文章</button>':''}</section>`;
 host.querySelector('[data-substack-author]').onchange=e=>{authorFilter=e.target.value;stockFilter='';limit=30;onChange();};
 host.querySelector('[data-substack-stock]').onchange=e=>{stockFilter=e.target.value;limit=30;onChange();};
 host.querySelector('[data-substack-date]').onchange=e=>{dateOnly=e.target.checked;limit=30;onChange();};
 host.querySelector('[data-substack-search]').onchange=e=>{query=e.target.value.trim();limit=30;onChange();};
 host.querySelector('[data-substack-more]')?.addEventListener('click',()=>{limit+=30;onChange();});
 host.querySelector('[data-substack-reload]').onclick=()=>void load();
 host.querySelector('[data-substack-refresh]').onclick=async e=>{e.target.disabled=true;const who=owner;try{const r=await api('/substack/refresh',{body:{}});if(who===owner)message=r.message;}catch(e){if(who===owner)error=e.message;}if(who===owner)onChange();};
 host.querySelector('[data-substack-import]')?.addEventListener('submit',async e=>{e.preventDefault();const who=owner,form=e.target;form.querySelector('button').disabled=true;try{const r=await api('/substack/authors',{body:{url:form.elements.url.value,title:form.elements.title.value}});if(who!==owner)return;message=r.message+(r.warning?'：'+r.warning:'');await load();}catch(e){if(who===owner)error=e.message;}if(who===owner)onChange();});
 if(!loaded&&!loading&&!error&&owner)queueMicrotask(()=>void load());
}
export function bindSubstackActions(root){root.querySelectorAll('[data-substack-open]').forEach(b=>b.onclick=()=>void openArticle(b.dataset.substackOpen,b.dataset.substackCode));}
async function openArticle(id,focus=''){
 const who=owner;if(!who)return;const version=generation;
 document.querySelector('#substack-article-dialog')?.closest('.modal-backdrop')?.remove();
 const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML='<section id="substack-article-dialog" class="summary-dialog ai-dialog" role="dialog" aria-modal="true" aria-label="Substack 作者文章"><div class="modal-heading"><h2>Substack 文章</h2><button data-substack-close aria-label="關閉文章">×</button></div><p data-substack-status role="status">正在取得原文…</p><div data-substack-content></div></section>';document.body.append(wrap);document.body.classList.add('modal-open');
 const close=()=>{wrap.remove();document.body.classList.toggle('modal-open',!!document.querySelector('.modal-backdrop'));};wrap.querySelector('[data-substack-close]').onclick=close;wrap.onkeydown=e=>{if(e.key==='Escape')close();};
 const status=wrap.querySelector('[data-substack-status]');
 try{const {article:a}=await api('/substack/article?id='+encodeURIComponent(id));if(who!==owner||version!==generation||!wrap.isConnected)return;
  const matches=substackMentions(a.text,[...new Map([...(a.mentions||[]),...context.companies].map(c=>[c.code,c])).values()]),recordId='substack:'+a.id,saved=resultRecords(who).find(r=>r.id===recordId&&r.answer);
  status.textContent=a.access==='public'?'已取得公開內文':'僅取得公開預覽；整理不包含付費牆後內容';
  const body=wrap.querySelector('[data-substack-content]');body.innerHTML=`<h3>${esc(a.title)}</h3><p>${esc(a.author_title)} · ${esc(a.date)} 美東</p><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">開啟原文</a><p>原文提及 ${matches.length} 檔標的；立場需查看 AI 整理及原文。</p><nav class="stock-actions">${matches.map(c=>`<button data-substack-locate="${esc(c.code)}">${esc(c.code.replace('US:',''))} ${esc(c.name)}</button>`).join('')}</nav><div class="stock-actions"><button data-substack-ai ${a.text?'':'disabled'}>${saved?'重新生成作者觀點（會呼叫 AI）':'生成作者標的與觀點'}</button>${saved?'<button data-substack-result>查看已保存的作者觀點</button>':''}</div>${matches.map(c=>`<details data-substack-evidence="${esc(c.code)}" ${c.code===focus?'open':''}><summary>${esc(c.code)} ${esc(c.name)} · 原文證據 · ${esc(c.status||'原文提及')}</summary>${c.evidence.map(e=>`<blockquote><small>段落 ${e.paragraph}</small><p>${esc(e.text)}</p></blockquote>`).join('')}</details>`).join('')}<details><summary>查看已取得原文</summary><p class="article-summary">${esc(a.text)}</p></details>`;
  body.querySelector('[data-substack-result]')?.addEventListener('click',()=>openResultsCenter(recordId,{focusCode:focus}));
  body.querySelectorAll('[data-substack-locate]').forEach(b=>b.onclick=()=>{const el=[...body.querySelectorAll('[data-substack-evidence]')].find(el=>el.dataset.substackEvidence===b.dataset.substackLocate);if(el){el.open=true;el.scrollIntoView({block:'center'});}});
  body.querySelector('[data-substack-ai]').onclick=async e=>{
   e.target.disabled=true;try{await requireAISession();if(who!==owner)throw Error('登入帳號已變更');const config={...currentAISettings()},companies=[...context.companies];
    const chunks=substackChunks(a.text);
    await runResultJob({id:recordId,title:a.title,kind:'substack',date:a.date,local_only:companyMode(config),episode:{id:a.id,title:a.title,date:a.date,url:a.url,channel_id:a.author_id,channel_name:a.author_title}},async(signal,progress)=>{
     const answers=[];for(let i=0;i<chunks.length;i++){progress(`整理作者觀點 ${i+1}／${chunks.length} 段`);answers.push((chunks.length>1?`## 原文片段 ${i+1}／${chunks.length}\n\n`:'')+await requestAI(config,substackPrompt({...a,...chunks[i]},[...new Map([...(a.mentions||[]),...companies].map(c=>[c.code,c])).values()]),{signal:AbortSignal.any([signal,AbortSignal.timeout(120000)])}));}
     return {answer:answers.join('\n\n'),text:a.text,partial:a.access!=='public',failures:a.access==='public'?[]:['僅依公開預覽分析，不含付費牆後內容']};
    });if(who===owner&&wrap.isConnected){status.textContent='作者觀點整理完成，已保存至你的 AI 成果中心';openResultsCenter(recordId,{focusCode:focus});}
   }catch(e){status.textContent=e.message;}finally{if(wrap.isConnected)e.target.disabled=false;}
  };
 }catch(e){if(wrap.isConnected)status.textContent=e.message;}
}
