"""Public Actions metadata uses opaque account IDs, never emails or credentials."""
import datetime
import json
import os
import re

def cell(value):
 text=re.sub(r'[\x00-\x1f\x7f]', ' ', str(value if value is not None else '—'))[:200]
 return re.sub(r'([\\`*_{}\[\]()<>|])', r'\\\1', text)

def summary(text):
 path=os.environ.get('GITHUB_STEP_SUMMARY')
 if path:
  with open(path,'a',encoding='utf-8') as output:output.write(text+'\n')

def record_run():
 request={key:os.environ.get('NEWS_'+key.upper(),'') for key in ['request_id','request_actor','request_code','request_source']}
 source=request['request_source'] or os.environ.get('GITHUB_EVENT_NAME','manual')
 print('News update trigger '+json.dumps({**request,'source':source},ensure_ascii=False),flush=True)
 summary('## 新聞更新觸發紀錄\n\n| 來源 | 帳號識別碼 | 個股 | 請求識別碼 |\n|---|---|---|---|\n'+
         '| '+' | '.join(cell(v or '—') for v in [source,request['request_actor'],request['request_code'],request['request_id']])+' |')

def record_job(job,details,error,triggers):
 status='failed' if error else 'success' if details.get('collected',0)>0 else 'empty'
 print('News update result '+json.dumps({'job_id':job['id'],'code':job['company_code'],'status':status,'collected':details.get('collected'),'triggers':triggers},ensure_ascii=False),flush=True)
 summary('\n### 個股 '+cell(job['company_code'])+'\n\n任務：'+cell(job['id'])+' · 結果：'+status+' · 收集：'+cell(details.get('collected'))+' 則\n\n'+
         '| 觸發時間（UTC） | 帳號識別碼 | 來源 | 請求識別碼 |\n|---|---|---|---|')
 for trigger in triggers or []:
  at=datetime.datetime.fromtimestamp(trigger['created_at']/1000,datetime.timezone.utc).isoformat()
  summary('| '+' | '.join(cell(v) for v in [at,trigger['actor'],trigger['source'],trigger['id']])+' |')
 if not triggers:summary('| — | — | '+('觸發紀錄暫時無法讀取' if triggers is None else '舊任務未記錄觸發者')+' | — |')

if __name__=='__main__':record_run()
