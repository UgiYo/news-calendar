import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('substack_sync', pathlib.Path(__file__).parents[1] / 'scripts/sync_substack.py')
sync = importlib.util.module_from_spec(spec); spec.loader.exec_module(sync)

def post(n, **extra):
    return dict(slug=f'post-{n}', title=f'Article {n}', post_date=f'2026-10-{min(28,n+1):02d}T12:00:00Z', audience='everyone', body_html='<p>NVIDIA 原文</p><script>bad()</script>', **extra)

class SubstackSyncTest(unittest.TestCase):
    def test_plain_text_and_paid_preview(self):
        a = sync.article_row({**post(0), 'audience': 'only_paid'}, {'url': 'https://example.substack.com'})
        self.assertEqual(a['access'], 'preview'); self.assertNotIn('bad', a['text']); self.assertIn('NVIDIA', a['text'])

    def test_history_resume_preserves_every_post_and_final_short_page(self):
        posts = [post(n) for n in range(45)]; uploaded = []
        def fetch(url):
            if '/archive?' in url:
                offset = int(url.split('offset=')[1].split('&')[0]); return posts[offset:offset+20]
            return posts[int(url.rsplit('-',1)[1])]
        author = {'id':'example','url':'https://example.substack.com','archive_offset':40,'archive_complete':0}
        sync.sync_author(author, lambda path,data: uploaded.append(data), fetch)
        self.assertEqual(len(uploaded), 2); self.assertEqual(uploaded[-1]['archive_offset'],45); self.assertTrue(uploaded[-1]['archive_complete'])
        self.assertEqual(len({a['url'] for batch in uploaded for a in batch['articles']}),25)

    def test_more_than_one_page_of_new_posts_and_oldest_first_checkpoint(self):
        posts = sorted([post(n) for n in range(26)], key=lambda p:p['post_date'], reverse=True); uploaded = []
        def fetch(url):
            if '/archive?' in url:
                offset = int(url.split('offset=')[1].split('&')[0]); return posts[offset:offset+20]
            return next(p for p in posts if p['slug'] == url.rsplit('/',1)[1])
        author={'id':'example','url':'https://example.substack.com','archive_offset':100,'archive_complete':1,'latest_published_at':'2026-10-01T12:00:00Z'}
        sync.sync_author(author, lambda path,data: uploaded.append(data), fetch)
        self.assertEqual(sum(len(b['articles']) for b in uploaded),25)
        self.assertLess(max(a['published_at'] for a in uploaded[0]['articles']),min(a['published_at'] for a in uploaded[1]['articles']))
        self.assertNotIn('archive_offset',uploaded[0])

    def test_source_error_does_not_commit_partial_page(self):
        uploaded=[]
        def fetch(url):
            if '/archive?' in url:return [post(0),post(1)]
            if url.endswith('post-1'):raise ValueError('Unavailable')
            return post(0)
        author={'id':'example','url':'https://example.substack.com','archive_offset':0,'archive_complete':0}
        with self.assertRaises(ValueError): sync.sync_author(author,lambda path,data:uploaded.append(data),fetch)
        self.assertEqual(uploaded,[])

    def test_utf8_batches_checkpoint_only_after_last_upload(self):
        uploaded=[];rows=[{**sync.article_row(post(n),{'url':'https://example.substack.com'}),'text':'中'*100000} for n in range(3)]
        sync.upload_update(lambda path,data:uploaded.append(data),{'author_id':'example','articles':rows,'archive_offset':3,'archive_complete':True})
        self.assertEqual(len(uploaded),3);self.assertTrue(all('archive_offset' not in b for b in uploaded[:-1]));self.assertEqual(uploaded[-1]['archive_offset'],3)

    def test_large_public_article_is_marked_partial_and_cannot_block_history(self):
        row=sync.article_row({**post(0),'body_html':'<p>'+'中'*100001+'</p>'},{'url':'https://example.substack.com'})
        self.assertEqual(len(row['text']),100000);self.assertEqual(row['access'],'preview')

if __name__ == '__main__': unittest.main()
