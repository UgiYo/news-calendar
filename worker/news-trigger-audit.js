export async function recordCollectionTrigger(sql,{id,jobId,code,actor,source,status}){
 await sql('CREATE TABLE IF NOT EXISTS news_collection_triggers(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,company_code TEXT NOT NULL,actor TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL)').run();
 await sql('CREATE INDEX IF NOT EXISTS collection_triggers_job ON news_collection_triggers(job_id,created_at)').run();
 await sql('INSERT INTO news_collection_triggers(id,job_id,company_code,actor,source,status,created_at) VALUES(?,?,?,?,?,?,?)',id,jobId,code,actor,source,status,Date.now()).run();
}
export async function collectionTriggers(sql,jobId){
 try{return (await sql('SELECT * FROM news_collection_triggers WHERE job_id=? ORDER BY created_at,id',jobId).all()).results;}
 catch(e){if(String(e.message).includes('no such table'))return [];throw e;}
}
