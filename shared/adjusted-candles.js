// Forward adjustment anchored to the latest provider OHLC close.
// Never combine adjustment factors with another provider's raw price basis.
export function adjustedDailyPrices(rows=[]){
 const valid=rows.filter(p=>[p.open,p.high,p.low,p.close].every(v=>Number.isFinite(v)&&v>0)&&p.low<=Math.min(p.open,p.close)&&p.high>=Math.max(p.open,p.close)).sort((a,b)=>a.date.localeCompare(b.date));
 if(!valid.length)throw Error('尚無可還原的日 K 資料');
 if(valid.some(p=>!Number.isFinite(p.adjusted_close)||p.adjusted_close<=0))throw Error('調整後收盤價不完整，無法還原 K 線；請更新資料後重試。');
 const latest=valid.at(-1),anchor=latest.adjusted_close/latest.close;
 return valid.map(p=>{const factor=(p.adjusted_close/p.close)/anchor;if(!Number.isFinite(factor)||factor<=0)throw Error('還原因子格式錯誤');const price=Object.fromEntries(['open','high','low','close'].map(k=>[k,p[k]*factor]));if(Object.values(price).some(v=>!Number.isFinite(v)||v<=0))throw Error('還原價格超出範圍');return {...p,...price,adjustment_factor:factor};});
}
