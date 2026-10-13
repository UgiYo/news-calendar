import {monthCells} from './utils.js';
export function openCalendarDatePicker(selected,onSelect){
 if(document.querySelector('#calendar-date-picker'))return;
 let [year,month]=selected.split('-').map(Number);month--;
 let view='days',yearEnd=Math.max(new Date().getFullYear(),year);
 const dialog=document.createElement('dialog');dialog.id='calendar-date-picker';dialog.className='calendar-date-picker';dialog.setAttribute('aria-label','選擇年月日');document.body.append(dialog);
 const close=()=>dialog.close();dialog.onclose=()=>{dialog.remove();document.querySelector('#calendar-date-jump')?.focus();};dialog.onclick=e=>{if(e.target===dialog)close();};
 const draw=(focus)=>{
  const years=Array.from({length:12},(_,i)=>yearEnd-i).filter(y=>y>=1900);
  dialog.innerHTML=`<div class="date-picker-heading"><h2>選擇日期</h2><button data-picker-close aria-label="關閉日期選擇">×</button></div><div class="date-picker-navigation"><button data-picker-prev aria-label="${view==='years'?'較早年份':'上一個月'}" ${view==='years'&&yearEnd<=1911?'disabled':''}>‹</button><button data-picker-year aria-expanded="${view==='years'}">${year} 年 ▾</button><button data-picker-month aria-expanded="${view==='months'}">${month+1} 月 ▾</button><button data-picker-next aria-label="${view==='years'?'較近年份':'下一個月'}" ${view==='years'&&yearEnd>=Math.max(new Date().getFullYear(),year)?'disabled':''}>›</button></div>${view==='years'?`<p class="date-picker-hint">選擇年份；按左箭頭可查看更早年份</p><div class="date-picker-options">${years.map(y=>`<button data-picker-year-value="${y}" aria-pressed="${y===year}">${y} 年</button>`).join('')}</div>`:view==='months'?`<div class="date-picker-options">${Array.from({length:12},(_,i)=>`<button data-picker-month-value="${i}" aria-pressed="${i===month}">${i+1} 月</button>`).join('')}</div>`:`<div class="date-picker-weekdays">${['日','一','二','三','四','五','六'].map(day=>`<span>${day}</span>`).join('')}</div><div class="date-picker-days">${monthCells(year,month).map(c=>`<button data-picker-date="${c.key}" aria-label="${c.key}" class="${c.current?'':'outside-month'}" ${c.key===selected?'aria-current="date"':''}>${c.number}</button>`).join('')}</div><p class="date-picker-hint">點選月份可選 1～12 月；點選年份可選過去年份</p>`}`;
  dialog.querySelector('[data-picker-close]').onclick=close;
  dialog.querySelector('[data-picker-year]').onclick=()=>{view=view==='years'?'days':'years';yearEnd=Math.max(new Date().getFullYear(),year);draw('[data-picker-year]');};
  dialog.querySelector('[data-picker-month]').onclick=()=>{view=view==='months'?'days':'months';draw('[data-picker-month]');};
  const shift=direction=>{if(view==='years'){yearEnd=Math.max(1911,Math.min(Math.max(new Date().getFullYear(),year),yearEnd+direction*12));}else{const next=new Date(year,month+direction,1);year=next.getFullYear();month=next.getMonth();view='days';}draw(direction<0?'[data-picker-prev]':'[data-picker-next]');};
  dialog.querySelector('[data-picker-prev]').onclick=()=>shift(-1);dialog.querySelector('[data-picker-next]').onclick=()=>shift(1);
  dialog.querySelectorAll('[data-picker-year-value]').forEach(button=>button.onclick=()=>{year=Number(button.dataset.pickerYearValue);view='days';draw('[data-picker-year]');});
  dialog.querySelectorAll('[data-picker-month-value]').forEach(button=>button.onclick=()=>{month=Number(button.dataset.pickerMonthValue);view='days';draw('[data-picker-month]');});
  dialog.querySelectorAll('[data-picker-date]').forEach(button=>button.onclick=()=>{const date=button.dataset.pickerDate;close();onSelect(date);});
  if(focus)dialog.querySelector(focus)?.focus();
 };draw();dialog.showModal();dialog.querySelector('[data-picker-year]').focus();
}
