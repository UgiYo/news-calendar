import {fetchUSPrices} from '../worker/us-market.js';
import {isUS} from '../shared/markets.js';
const base=process.env.WORKER_API_URL?.replace(/\/$/,''),secret=process.env.COLLECTOR_SECRET;
if(!base||!secret)throw Error('Missing collector configuration');
async function api(path,body){
 const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json','User-Agent':'StockNewsCalendar/3.0'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error('Collector API HTTP '+response.status);return response.json();
}
const companies=(await api('/admin/tracked')).companies.filter(c=>isUS(c.code)),failures=[];
for(const c of companies)try{
 const {rows}=await fetchUSPrices(c.code);
 for(let i=0;i<rows.length;i+=20)await api('/admin/us-prices',{prices:rows.slice(i,i+20)});
 process.stdout.write(`${c.code}: ${rows.length} completed daily bars, latest ${rows.at(-1)?.date}\n`);
}catch(e){failures.push(c.code);process.stderr.write(`${c.code}: ${e.message}\n`);}
if(failures.length)throw Error('US price refresh incomplete: '+failures.join(','));
