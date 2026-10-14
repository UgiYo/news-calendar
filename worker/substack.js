import {DEFAULT_SUBSTACK,substackPublication,substackMentions} from '../shared/substack.js';
import {marketDay} from '../shared/markets.js';
export function normalizeSubstackArticle(data,author){
 const u=new URL(data.url);
 if(u.origin!==author.url||!/^\/p\/[^/]+$/.test(u.pathname)||u.username||u.password)throw Error('文章必須來自對應刊物');
 if(!data.title||String(data.title).length>1000||!Number.isFinite(Date.parse(data.published_at)))throw Error('文章格式錯誤');
 const text=String(data.text||'');if(text.length>100000)throw Error('文章內文超過上限');
 return {id:author.id+':'+u.pathname.slice(3),author_id:author.id,author_title:author.title,url:u.origin+u.pathname,title:String(data.title),published_at:new Date(data.published_at).toISOString(),date:marketDay(new Date(data.published_at),'US'),access:data.access==='public'?'public':'preview',text,mentions:substackMentions(text)};
}
export async function substackRoute(req,{sql,reply,user,admin=false,dispatch,env,flags={}}){
 const u=new URL(req.url),path=u.pathname;
 if(!['/substack/authors','/substack/articles','/substack/article','/substack/refresh','/admin/substack/authors','/admin/substack/update'].includes(path))return null;
 if(!admin&&!user)return reply({error:'請先登入'},401);
 if(path.startsWith('/admin/')&&!admin)return reply({error:'Forbidden'},403);
 if(!admin&&(flags['markets.us']===false||flags['news_calendar.substack']===false))return reply({error:'Substack 功能目前未開放'},403);
 await sql('CREATE TABLE IF NOT EXISTS substack_authors(id TEXT PRIMARY KEY,url TEXT UNIQUE NOT NULL,title TEXT NOT NULL,archive_offset INTEGER NOT NULL DEFAULT 0,archive_complete INTEGER NOT NULL DEFAULT 0,updated_at TEXT,last_error TEXT)').run();
 await sql('CREATE TABLE IF NOT EXISTS substack_articles(id TEXT PRIMARY KEY,author_id TEXT NOT NULL,date TEXT NOT NULL,published_at TEXT NOT NULL,payload TEXT NOT NULL)').run();
 await sql('CREATE INDEX IF NOT EXISTS substack_articles_date ON substack_articles(date DESC,published_at DESC,id)').run();
 await sql('INSERT INTO substack_authors(id,url,title) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING',DEFAULT_SUBSTACK.id,DEFAULT_SUBSTACK.url,DEFAULT_SUBSTACK.title).run();
 if(path.endsWith('/authors')&&req.method==='GET')return reply({authors:(await sql('SELECT a.*,(SELECT MAX(published_at) FROM substack_articles WHERE author_id=a.id) AS latest_published_at FROM substack_authors a ORDER BY title').all()).results});
 if(path==='/substack/authors'&&req.method==='POST'){
  if(flags['news_calendar.substack_import']===false)return reply({error:'作者匯入目前未開放'},403);
  try{const data=await req.json(),url=substackPublication(data.url),id=new URL(url).hostname.split('.')[0];const count=await sql('SELECT COUNT(*) AS total FROM substack_authors').first();if(count.total>=50&&!await sql('SELECT id FROM substack_authors WHERE id=?',id).first())throw Error('作者已達 50 位上限');
   await sql('INSERT INTO substack_authors(id,url,title) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING',id,url,String(data.title||id).slice(0,500)).run();
   let warning='';try{await dispatch(env,'substack.yml');}catch(e){warning=e.message;}return reply({ok:true,warning,message:warning?'作者已保存，排程尚未啟動':'作者已保存，歷史文章匯入已排入背景'});
  }catch(e){return reply({error:e.message},400);}
 }
 if(path==='/substack/refresh'&&req.method==='POST'){
  const row=await sql('SELECT MAX(updated_at) AS latest FROM substack_authors').first();if(row.latest&&Date.now()-Date.parse(row.latest)<15*60000)return reply({message:'最近 15 分鐘已更新，請先重新載入文章'});
  try{await dispatch(env,'substack.yml');return reply({message:'已排入背景更新；完成後請重新載入文章'});}catch(e){return reply({error:e.message},502);}
 }
 if(path==='/substack/articles'&&req.method==='GET'){
  const offset=Number(u.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)return reply({error:'Invalid offset'},400);
  const rows=(await sql('SELECT payload FROM substack_articles ORDER BY published_at DESC,id LIMIT 100 OFFSET ?',offset).all()).results;
  return reply({articles:rows.map(r=>{const {text,...row}=JSON.parse(r.payload);return {...row,mentions:row.mentions.map(({code,name,status})=>({code,name,status}))};}),has_more:rows.length===100,next_offset:offset+rows.length});
 }
 if(path==='/substack/article'&&req.method==='GET'){const row=await sql('SELECT payload FROM substack_articles WHERE id=?',u.searchParams.get('id')).first();return row?reply({article:JSON.parse(row.payload)}):reply({error:'找不到文章'},404);}
 if(path==='/admin/substack/update'&&req.method==='POST'){
  try{const raw=await req.text();if(new TextEncoder().encode(raw).length>1500000)throw Error('批次內容過大');const data=JSON.parse(raw),author=await sql('SELECT * FROM substack_authors WHERE id=?',data.author_id).first();if(!author)throw Error('找不到作者');
   if(data.error){await sql('UPDATE substack_authors SET last_error=? WHERE id=?',String(data.error).slice(0,500),author.id).run();return reply({ok:true});}
   if(!Array.isArray(data.articles)||data.articles.length>20)throw Error('批次格式錯誤');
   const articles=data.articles.map(a=>normalizeSubstackArticle(a,author));for(const a of articles)await sql('INSERT INTO substack_articles(id,author_id,date,published_at,payload) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,date=excluded.date,published_at=excluded.published_at',a.id,a.author_id,a.date,a.published_at,JSON.stringify(a)).run();
   const offset=data.archive_offset??author.archive_offset;if(!Number.isSafeInteger(offset)||offset<0)throw Error('Invalid archive cursor');
   await sql('UPDATE substack_authors SET archive_offset=?,archive_complete=?,updated_at=?,last_error=NULL WHERE id=?',offset,data.archive_complete===undefined?author.archive_complete:Number(!!data.archive_complete),new Date().toISOString(),author.id).run();return reply({ok:true,count:articles.length});
  }catch(e){return reply({error:e.message},400);}
 }
 return reply({error:'Method not allowed'},405);
}
