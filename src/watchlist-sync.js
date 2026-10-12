import {syncOwner,syncEnabled,setSyncEnabled,deviceData,saveDeviceData,rememberCloudWatchlist,mergeNews} from './account-sync.js';
const assertOwner=who=>{if(who==='guest'||syncOwner()!==who)throw Error('登入帳號已變更，已停止追蹤同步。');};
function scoped(who,request){return async(path,options={})=>{assertOwner(who);const data=await request(path,options);assertOwner(who);return data;};}
async function cloudWatchlist(call){const data=await call('/watchlists');if(!Array.isArray(data.companies))throw Error('追蹤清單格式異常，未覆蓋本機資料。');return data.companies;}
async function mergeToCloud(who,call){
 const snapshot=deviceData(who),cloud=await cloudWatchlist(call),known=new Set(cloud.map(c=>c.code));
 const baseline=Array.isArray(snapshot?.watchlistBaseline)?new Set(snapshot.watchlistBaseline):null,adds=new Set(snapshot?.pendingAdds||[]),removes=new Set(snapshot?.pendingRemoves||[]);
 const pending=(snapshot?.companies||[]).filter(c=>!baseline||!baseline.has(c.code)||adds.has(c.code));let changed=false;
 for(const c of pending){
  if(known.has(c.code)||removes.has(c.code))continue;
  try{await call('/watchlists',{body:{code:c.code}});}catch(error){
   if(error.status!==404)throw error;
   const catalog=await call('/companies?q='+encodeURIComponent(c.code));if(!catalog.companies?.some(x=>x.code===c.code))throw Error(c.code+' 公司名錄不存在，已保留本機追蹤清單。');
   await call('/watchlists',{body:{code:c.code}});
  }
  known.add(c.code);changed=true;
 }
 for(const code of removes)if(known.has(code)){await call('/watchlists?code='+encodeURIComponent(code),{method:'DELETE'});changed=true;}
 return changed?cloudWatchlist(call):cloud;
}
export async function setWatchlistSync(enabled,{who=syncOwner(),request,companies=[],news=[]}={}){
 const call=scoped(who,request),snapshot=deviceData(who),wasEnabled=syncEnabled(who);
 const rows=enabled?await mergeToCloud(who,call):wasEnabled?await cloudWatchlist(call):snapshot?.companies||companies;
 const setting=await call('/account-settings',{body:{sync_enabled:!!enabled}});if(setting.owner_id!==who||setting.sync_enabled!==!!enabled)throw Error('登入身分或同步設定核對不一致。');
 if(enabled)rememberCloudWatchlist(who,rows);
 else saveDeviceData({...snapshot,companies:rows,news:mergeNews(snapshot?.news||[],news),...(wasEnabled?{watchlistBaseline:rows.map(c=>c.code),pendingAdds:[],pendingRemoves:[]}: {})},who);
 setSyncEnabled(enabled,who);return {enabled:!!enabled,companies:rows};
}
export async function restoreWatchlistSync({who=syncOwner(),request}={}){
 const call=scoped(who,request),setting=await call('/account-settings');
 if(setting.owner_id!==who)throw Error('登入身分核對不一致，未套用其他帳號設定。');
 if(setting.sync_enabled===null){
  // Preserve explicit device-only use; migrate an existing enabled account once.
  if(syncEnabled(who))return {...await setWatchlistSync(true,{who,request}),changed:true};
  return {enabled:false,changed:false};
 }
 if(typeof setting.sync_enabled!=='boolean')throw Error('同步設定格式異常，已保留本機設定。');
 const before=syncEnabled(who);
 if(setting.sync_enabled){
  const previous=deviceData(who)?.companies||[],rows=await mergeToCloud(who,call);rememberCloudWatchlist(who,rows);setSyncEnabled(true,who);
  return {enabled:true,companies:rows,changed:!before||JSON.stringify(previous.map(c=>c.code).sort())!==JSON.stringify(rows.map(c=>c.code).sort())};
 }
 if(before){const rows=await cloudWatchlist(call);rememberCloudWatchlist(who,rows);setSyncEnabled(false,who);return {enabled:false,companies:rows,changed:true};}
 return {enabled:false,changed:false};
}
