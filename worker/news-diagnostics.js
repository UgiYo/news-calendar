const fields=['requests','feed_items','matched_items','accepted_items','collected','http_status','rejected_source','rejected_company','rejected_date','rejected_url'];
export async function recordNewsAttempt(sql,{code,jobId=null,stage,status,details={}}){
 details=details&&typeof details==='object'?details:{};const safe={};for(const key of fields)if(Number.isSafeInteger(details[key])&&details[key]>=0)safe[key]=details[key];
 for(const key of ['error','from','to','run_url'])if(typeof details[key]==='string')safe[key]=details[key].slice(0,600);
 await sql('CREATE TABLE IF NOT EXISTS news_update_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,company_code TEXT NOT NULL,job_id TEXT,stage TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,details TEXT NOT NULL)').run();
 await sql('CREATE INDEX IF NOT EXISTS news_attempts_company ON news_update_attempts(company_code,created_at)').run();
 await sql('CREATE INDEX IF NOT EXISTS news_attempts_job ON news_update_attempts(job_id,created_at)').run();
 await sql('INSERT INTO news_update_attempts(company_code,job_id,stage,status,created_at,details) VALUES(?,?,?,?,?,?)',code,jobId,stage,status,Date.now(),JSON.stringify(safe)).run();
}
export async function newsAttempts(sql,{code,jobId}={}){
 try{return (await sql(jobId?'SELECT * FROM news_update_attempts WHERE job_id=? ORDER BY id DESC LIMIT 1':'SELECT * FROM news_update_attempts WHERE company_code=? ORDER BY id DESC LIMIT 30',jobId||code).all()).results.map(r=>({...r,details:JSON.parse(r.details)}));}
 catch(e){if(String(e.message).includes('no such table'))return [];throw e;}
}
