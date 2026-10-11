import importlib.util
import os
from pathlib import Path
import unittest
import sys
import types
from unittest.mock import patch

class DeviceCollectorTests(unittest.TestCase):
 def setUp(self):
  spec=importlib.util.spec_from_file_location('collector',Path(__file__).parents[1]/'scripts/collect.py')
  self.module=importlib.util.module_from_spec(spec)
  self.requests=types.SimpleNamespace(Timeout=type('Timeout',(Exception,),{}),ConnectionError=type('ConnectionError',(Exception,),{}),HTTPError=type('HTTPError',(Exception,),{}),get=None)
  with patch.dict(sys.modules,{'requests':self.requests}),patch.dict(os.environ,{'WORKER_API_URL':'https://example.com','COLLECTOR_SECRET':'fixture'}):spec.loader.exec_module(self.module)
 def run_job(self,company,fail=None):
  calls=[];claims=iter([{'jobs':[{'id':'job1','type':'collect','company_code':'6515'}]},{'jobs':[]}])
  def api(path,body=None):
   calls.append((path,body))
   if path=='/admin/tracked':return {'companies':[]}
   if path=='/admin/claim':return next(claims)
   if path.startswith('/admin/collection-company'):return {'company':company}
   return {'ok':True}
  def collect(c,details):
   self.assertEqual(c,company);details.update(requests=1,feed_items=2,collected=0,http_status=200)
   if fail:details['http_status']=429;raise fail
  with patch.object(self.module,'api',side_effect=api),patch.object(self.module,'collect',side_effect=collect) as fn,patch.dict(os.environ,{'RUN_MODE':'queued'}):self.module.main()
  return calls,fn
 def test_local_only_company_is_collected_and_zero_result_is_recorded(self):
  calls,fn=self.run_job({'code':'6515','name':'穎崴'});fn.assert_called_once()
  audit=next(b for p,b in calls if p=='/admin/news-attempts');self.assertEqual(audit['status'],'empty');self.assertEqual(audit['job_id'],'job1');self.assertEqual(audit['details']['feed_items'],2)
  self.assertIsNone(next(b for p,b in calls if p=='/admin/job')['error'])
 def test_missing_catalog_company_fails_instead_of_reporting_done(self):
  calls,fn=self.run_job(None);fn.assert_not_called();self.assertIn('公司名錄缺少',next(b for p,b in calls if p=='/admin/job')['error'])
  self.assertEqual(next(b for p,b in calls if p=='/admin/news-attempts')['status'],'failed')
 def test_source_failure_keeps_counters_and_http_reason(self):
  calls,_=self.run_job({'code':'6515'},ValueError('Google News RSS HTTP 429'))
  audit=next(b for p,b in calls if p=='/admin/news-attempts');self.assertEqual(audit['details']['requests'],1);self.assertIn('429',audit['details']['error']);self.assertEqual(audit['status'],'failed')

 def test_collect_reports_empty_feed_counts_instead_of_inventing_source_failure(self):
  response=types.SimpleNamespace(ok=True,status_code=200,content=b'<rss><channel></channel></rss>')
  calls=[]
  def api(path,body=None):
   calls.append((path,body));return {'names':[]} if path.startswith('/admin/company-aliases') else {'ok':True}
  company={'code':'6515','name':'穎崴','full_name':'穎崴科技','last_collected_at':self.module.datetime.datetime.now(self.module.UTC).isoformat()}
  with patch.object(self.requests,'get',return_value=response),patch.object(self.module,'api',side_effect=api),patch.object(self.module.time,'sleep'):
   details=self.module.collect(company)
  self.assertGreater(details['requests'],0);self.assertEqual(details['http_status'],200);self.assertEqual(details['feed_items'],0);self.assertEqual(details['collected'],0);self.assertNotIn('error',details)

 def test_http_failure_retains_status_before_feed_parse(self):
  response=types.SimpleNamespace(ok=False,status_code=429)
  details={}
  with patch.object(self.requests,'get',return_value=response),patch.object(self.module,'api',return_value={'names':[]}):
   with self.assertRaisesRegex(ValueError,'HTTP 429'):self.module.collect({'code':'6515','name':'穎崴','full_name':'穎崴科技'},details)
  self.assertEqual(details['http_status'],429);self.assertEqual(details['requests'],1);self.assertEqual(details['feed_items'],0)
