import {substackMentions,substackPublication} from '../shared/substack.js';
export function decorateSubstackSummary(body,record,focus=''){
 const stocks=substackMentions(record.text);
 try{const url=new URL(record.episode?.url);if(substackPublication(url.href)===url.origin){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=(record.episode?.channel_name||'作者')+' · 查看原文';body.prepend(link);}}catch{}
 const note=document.createElement('p');note.textContent='以下為作者觀點整理；原文提及不等於推薦或持倉。'+(record.partial?'僅根據公開預覽。':'');body.prepend(note);
 const nav=document.createElement('nav');nav.className='stock-actions';
 for(const c of stocks){const section=document.createElement('details');section.dataset.substackEvidence=c.code;const title=document.createElement('summary');title.textContent=c.code+' '+c.name+' · 原文證據';section.append(title);for(const e of c.evidence){const p=document.createElement('p');p.textContent='段落 '+e.paragraph+'：'+e.text;section.append(p);}body.append(section);const b=document.createElement('button');b.type='button';b.textContent=c.code+' '+c.name;b.onclick=()=>{section.open=true;section.scrollIntoView({block:'center'});};nav.append(b);if(c.code===focus)section.open=true;}
 body.prepend(nav);
}
