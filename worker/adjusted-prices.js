import {isUS,validStockCode,symbolOf,marketDay,completedMarketDay} from '../shared/markets.js';
import {adjustedDailyPrices} from '../shared/adjusted-candles.js';
export function adjustmentSnapshot(result,code,now=new Date()){
 const quote=result.indicators?.quote?.[0],adj=result.indicators?.adjclose?.[0]?.adjclose,cutoff=isUS(code)?completedMarketDay(now,'US'):marketDay(now,'TW');
 const rows=(result.timestamp||[]).flatMap((t,i)=>{
  const date=marketDay(new Date(t*1000),isUS(code)?'US':'TW'),[open,high,low,close]=['open','high','low','close'].map(k=>quote?.[k]?.[i]);
  if(date>cutoff||![open,high,low,close].every(v=>Number.isFinite(v)&&v>0)||low>Math.min(open,close)||high<Math.max(open,close))return [];
  return [{code,date,open,high,low,close,volume:Number.isFinite(quote?.volume?.[i])?quote.volume[i]:null,adjusted_close:adj?.[i]??null}];
 });
 adjustedDailyPrices(rows);return rows;
}
export async function fetchAdjustmentSnapshot(code,company,fetcher=fetch,now=new Date()){
 const symbol=isUS(code)?symbolOf(code).replaceAll('.','-'):code+(company.market==='上櫃'?'.TWO':'.TW');let lastError;
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com'])try{
  const r=await fetcher(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&includePrePost=false&includeAdjustedClose=true&events=div%2Csplits`,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('行情 HTTP '+r.status);const result=(await r.json()).chart?.result?.[0];if(result?.meta?.symbol?.toUpperCase()!==symbol.toUpperCase())throw Error('還原行情代號不符');
  return {prices:adjustmentSnapshot(result,code,now),source:'Yahoo Finance',adjustment:'forward',basis:'provider-ohlc',asOf:now.toISOString()};
 }catch(e){lastError=e;}
 throw Error('還原 K 資料暫時無法取得：'+(lastError?.message||'來源未提供調整資料'));
}
export async function adjustedPricesRoute(req,env,{sql,reply,user,effectiveFeatureSettings}){
 const url=new URL(req.url);if(url.pathname!=='/adjusted-prices')return null;
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed'},405);
 const code=url.searchParams.get('code');if(!validStockCode(code))return reply({error:'股票代號格式錯誤'},400);
 const flags=await effectiveFeatureSettings(sql,user);
 if(flags['stock_tools.adjusted_candles']===false||flags['stock_tools.candles']===false||flags['markets.'+(isUS(code)?'us':'tw')]===false)return reply({error:'還原 K 功能或市場目前未開放'},403);
 const company=isUS(code)?null:await sql('SELECT * FROM companies WHERE code=?',code).first();if(!isUS(code)&&!company)return reply({error:'公司不存在'},404);
 await sql('CREATE TABLE IF NOT EXISTS adjusted_price_snapshots(code TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)').run();
 const stored=await sql('SELECT payload,updated_at FROM adjusted_price_snapshots WHERE code=?',code).first();
 const today=marketDay(new Date(),isUS(code)?'US':'TW'),fresh=stored&&Date.now()-stored.updated_at<86400000&&marketDay(new Date(stored.updated_at),isUS(code)?'US':'TW')===today;
 if(req.method==='GET'&&fresh)return reply({...JSON.parse(stored.payload),cached:true});
 try{const result=await fetchAdjustmentSnapshot(code,company);await sql('INSERT INTO adjusted_price_snapshots(code,payload,updated_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',code,JSON.stringify(result),Date.now()).run();return reply({...result,cached:false});}
 catch(e){return stored?reply({...JSON.parse(stored.payload),cached:true,stale:true,warning:e.message+'；目前保留先前還原資料，請稍後更新。'}):reply({error:e.message},502);}
}
