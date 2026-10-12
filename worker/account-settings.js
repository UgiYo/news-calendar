export async function accountSettingsRoute(req,{sql,reply,user}){
 const url=new URL(req.url);if(url.pathname!=='/account-settings')return null;
 if(!user?.id)return reply({error:'請先登入'},401);
 if(!['GET','POST'].includes(req.method))return reply({error:'Method not allowed'},405);
 await sql('CREATE TABLE IF NOT EXISTS account_settings(user_id TEXT PRIMARY KEY REFERENCES users(id),sync_enabled INTEGER NOT NULL,updated_at INTEGER NOT NULL)').run();
 if(req.method==='GET'){
  const row=await sql('SELECT sync_enabled,updated_at FROM account_settings WHERE user_id=?',user.id).first();
  return reply({owner_id:user.id,sync_enabled:row?!!row.sync_enabled:null,updated_at:row?.updated_at||null});
 }
 let body;try{body=await req.json();}catch{return reply({error:'Invalid JSON'},400);}if(!body||Object.keys(body).length!==1||typeof body.sync_enabled!=='boolean')return reply({error:'Invalid settings'},400);
 await sql('INSERT INTO account_settings(user_id,sync_enabled,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET sync_enabled=excluded.sync_enabled,updated_at=excluded.updated_at WHERE account_settings.sync_enabled<>excluded.sync_enabled',user.id,body.sync_enabled?1:0,Date.now()).run();
 return reply({owner_id:user.id,sync_enabled:body.sync_enabled});
}
