"""Import public Substack archive pages, with a durable cursor and no AI calls.

No cookies, credentials or paid-content access are used. Paid posts are previews.
"""
import datetime
import html.parser
import json
import os
import urllib.parse
import urllib.request

class ArticleText(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'button', 'noscript'): self.skip += 1
        if not self.skip and tag in ('p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'blockquote', 'tr'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'button', 'noscript'): self.skip = max(0, self.skip - 1)
        if not self.skip and tag in ('p', 'div', 'li', 'blockquote', 'tr'): self.parts.append('\n')
    def handle_data(self, text):
        if not self.skip: self.parts.append(text)
    def text(self):
        return '\n'.join(' '.join(line.split()) for line in ''.join(self.parts).splitlines() if line.strip())

def article_row(post, author):
    slug = str(post.get('slug', ''))
    if not slug or '/' in slug or '?' in slug or '#' in slug: raise ValueError('Invalid article slug')
    date = post.get('post_date') or post.get('published_at')
    datetime.datetime.fromisoformat(str(date).replace('Z', '+00:00'))
    parser = ArticleText(); parser.feed(post.get('body_html') or post.get('description') or post.get('subtitle') or '')
    text = parser.text()
    return {'url': author['url'] + '/p/' + urllib.parse.quote(slug, safe='-'), 'title': str(post.get('title') or slug), 'published_at': date, 'text': text[:100000],
            'access': 'public' if len(text) <= 100000 and post.get('audience') == 'everyone' and post.get('body_html') and not post.get('is_paid') else 'preview'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): raise ValueError('Unexpected source redirect')

def read_json(url, data=None, token=None):
    headers = {'User-Agent': 'StockNewsCalendar/1.0', 'Accept': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    if data is not None: headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, data=json.dumps(data, ensure_ascii=False).encode() if data is not None else None, headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=35) as response:
        limit = 1500000 if token else 12000000
        raw = response.read(limit + 1)
        if len(raw) > limit: raise ValueError('Source response too large')
        return json.loads(raw)

def upload_update(api, data):
    # Bound UTF-8 upload size, not character count. Advance the archive cursor
    # only on the last successfully saved chunk; retries upsert earlier chunks.
    rows = data['articles']; batch = []; size = 0
    for row in rows:
        count = len(json.dumps(row, ensure_ascii=False).encode())
        if batch and size + count > 500000:
            api('/admin/substack/update', {'author_id': data['author_id'], 'articles': batch})
            batch = []; size = 0
        batch.append(row); size += count
    api('/admin/substack/update', {**data, 'articles': batch})

def sync_author(author, api, fetch=read_json, max_pages=10):
    def detail_row(post):
        detail = fetch(author['url'] + '/api/v1/posts/' + urllib.parse.quote(str(post['slug']), safe='-'))
        if not isinstance(detail, dict) or str(detail.get('slug')) != str(post['slug']): raise ValueError('Article source mismatch')
        return article_row(detail, author)
    # Collect new pages until the saved publication date. Commit oldest first:
    # a failed upload cannot advance the latest date past an unsaved newer page.
    latest = author.get('latest_published_at')
    if latest:
        latest = datetime.datetime.fromisoformat(latest.replace('Z', '+00:00'))
        batches = []; offset = 0; seen_pages = set()
        while True:
            posts = fetch(author['url'] + '/api/v1/archive?sort=new&offset=' + str(offset) + '&limit=20')
            if not isinstance(posts, list): raise ValueError('Archive response is not a list')
            signature = tuple(str(p.get('slug', '')) for p in posts)
            if posts and signature in seen_pages: raise ValueError('Archive pagination did not advance')
            seen_pages.add(signature)
            new = [p for p in posts if datetime.datetime.fromisoformat(str(p['post_date']).replace('Z', '+00:00')) > latest]
            if new: batches.append([detail_row(p) for p in new])
            if len(new) < len(posts) or len(posts) < 20: break
            offset += len(posts)
        for rows in reversed(batches): upload_update(api, {'author_id': author['id'], 'articles': sorted(rows, key=lambda r:r['published_at'])})
    if author['archive_complete']: return
    # Resume historical pages, overlapping one page to absorb archive shifts.
    offsets = [max(0, author['archive_offset'] - 20)]
    for page in range(max_pages):
        offset = offsets.pop(0)
        posts = fetch(author['url'] + '/api/v1/archive?sort=new&offset=' + str(offset) + '&limit=20')
        if not isinstance(posts, list): raise ValueError('Archive response is not a list')
        if posts and any(not p.get('slug') for p in posts): raise ValueError('Archive response missing article slugs')
        rows = []
        for post in posts:
            # Archive lists may omit bodies; use only anonymously accessible detail.
            rows.append(detail_row(post))
        historical = True
        update = {'author_id': author['id'], 'articles': rows}
        if historical:
            update.update(archive_offset=offset + len(posts), archive_complete=len(posts) < 20)
        upload_update(api, update)
        if historical and len(posts) == 20 and not offsets: offsets.append(offset + len(posts))
        if not offsets: break

def main():
    base = os.environ['WORKER_API_URL'].rstrip('/'); token = os.environ['COLLECTOR_SECRET']
    def api(path, data=None): return read_json(base + path, data, token)
    errors = []
    for author in api('/admin/substack/authors')['authors']:
        try:
            sync_author(author, api)
        except Exception as error:
            message = str(error)[:400]; print(author['id'] + ': ' + message); errors.append(author['id'])
            api('/admin/substack/update', {'author_id': author['id'], 'error': '公開文章更新失敗：' + message})
    if errors: raise RuntimeError('Failed authors: ' + ', '.join(errors))

if __name__ == '__main__': main()
