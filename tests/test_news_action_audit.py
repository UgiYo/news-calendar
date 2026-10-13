import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('news_action_audit',Path(__file__).parents[1]/'scripts/news_action_audit.py')
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

class NewsActionAuditTests(unittest.TestCase):
 def test_run_and_job_summary_show_trigger_and_zero_result(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'summary.md';logs=io.StringIO()
   with patch.dict(os.environ,{'GITHUB_STEP_SUMMARY':str(path),'NEWS_REQUEST_ID':'request1','NEWS_REQUEST_ACTOR':'abc123','NEWS_REQUEST_CODE':'US:NVDA','NEWS_REQUEST_SOURCE':'user-update'}),contextlib.redirect_stdout(logs):
    audit.record_run()
    audit.record_job({'id':'job1','company_code':'US:NVDA'},{'collected':0},None,[{'id':'request1','actor':'abc123','source':'user-update','created_at':0},{'id':'request2','actor':'def456','source':'device-fallback','created_at':1000}])
   text=path.read_text();self.assertIn('empty',text);self.assertIn('0 則',text);self.assertIn('abc123',text);self.assertIn('def456',text);self.assertIn('1970-01-01',text);self.assertIn('"status": "empty"',logs.getvalue())
 def test_failure_and_legacy_job_without_trigger(self):
  logs=io.StringIO()
  with patch.dict(os.environ,{},clear=True),contextlib.redirect_stdout(logs):audit.record_job({'id':'old','company_code':'2330'},{},'source failed',[])
  self.assertIn('"status": "failed"',logs.getvalue())
 def test_markdown_cells_escape_injected_markup_and_newlines(self):
  value=audit.cell('bad|[link](url)\n::warning::secret')
  self.assertNotIn('\n',value);self.assertIn(r'\|',value);self.assertIn(r'\[',value)
