import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('ranking_turnover',Path(__file__).parents[1]/'scripts/ranking.py')
ranking=importlib.util.module_from_spec(spec)
with patch.dict(sys.modules,{'collect':Mock()}):spec.loader.exec_module(ranking)
class TurnoverTests(unittest.TestCase):
 def data(self):
  catalog=[{'公司代號':str(1000+i),'公司簡稱':'公司','產業別':'28'} for i in range(105)]
  rows=[{'Code':str(1000+i),'TradeValue':'1,234'} for i in range(105)]
  return rows,catalog
 def test_missing_official_amounts_do_not_abort_the_whole_market_or_become_zero(self):
  rows,catalog=self.data()
  for i,value in enumerate(['','  ','--',None]):rows[i]['TradeValue']=value
  normalized=ranking.normalize(rows,catalog,'上市')
  self.assertEqual(len(normalized),101);self.assertTrue(all(r['amount']==1234 for r in normalized));self.assertTrue(all(r['code'] not in ['1000','1001','1002','1003'] for r in normalized))
 def test_otc_missing_amount_is_skipped_and_real_zero_is_kept(self):
  rows,catalog=self.data();rows[0]={'SecuritiesCompanyCode':'1000','TransactionAmount':''};rows[1]={'SecuritiesCompanyCode':'1001','TransactionAmount':'0'}
  normalized=ranking.normalize(rows,catalog,'上櫃');self.assertEqual(len(normalized),104);self.assertEqual(next(r for r in normalized if r['code']=='1001')['amount'],0)
 def test_invalid_and_nonfinite_amounts_still_fail_instead_of_publishing_corrupt_data(self):
  for value in ['unexpected','NaN','Infinity','-1']:
   rows,catalog=self.data();rows[0]['TradeValue']=value
   with self.subTest(value=value),self.assertRaises(ValueError):ranking.normalize(rows,catalog,'上市')
 def test_a_feed_with_most_turnover_values_missing_is_rejected(self):
  rows,catalog=self.data()
  for row in rows[:10]:row['TradeValue']=''
  with self.assertRaisesRegex(ValueError,'Incomplete'):ranking.normalize(rows,catalog,'上市')
if __name__=='__main__':unittest.main()
