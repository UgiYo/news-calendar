# 美股 Substack 作者文章與標的觀點

美股頁面新增作者文章區，預設刊物為「大叔美股筆記 Uncle Stock Notes」，對應使用者提供的 `https://substack.com/@unclestocknotes`。台股與 Podcast 資料維持各自來源。

## 使用方式

1. 在美股頁面展開「新增作者／匯入全部歷史文章」，貼上 `https://作者.substack.com`。已驗證的大叔個人頁網址也可直接貼上。
2. 作者加入共用來源後，背景工作分批匯入歷史文章；同一網址重複匯入會更新既有文章。來源失敗保留資料與歷史游標。
3. 以作者、標的、標題或選定日期篩選。預設顯示所有歷史日期，左側選定個股時只顯示該股票相關文章。
4. 月曆顯示「★ Substack」的日期代表原文提及目前追蹤美股；點日期可查看相關文章。文章的星號表示目前追蹤股。
5. 點股票按鈕可定位原文段落。原文比對只代表提及，不代表看多、推薦買進或持倉。
6. 主動點「生成作者標的與觀點」才會呼叫個人 AI，整理作者立場、理由、催化事件、風險、期限與明確操作。成果保存於同帳號的 AI 成果中心，可跨裝置同步。長文分段處理，保留全篇原文段落編號。

## 匯入範圍與更新

- 使用匿名可取得的 Substack 刊物 archive 與文章內容；不使用訂閱帳號、cookie 或付費牆繞過方法。付費文章或無完整內文的文章標記為「公開預覽／部分內容」，AI 不推測未取得的部分。本文超過 100,000 字元時只保留前段，亦標記部分內容。
- 目前收錄刊物文章；不含作者的 Notes、留言、Chat 或其他作者的轉貼全文。
- 新文分頁讀取至已保存的最新日期，先保存較舊的新文批次，避免中途失敗漏抓。歷史每次最多 10 頁、每頁 20 篇，保存游標，下次重疊一頁後續抓。
- `.github/workflows/substack.yml` 每日台灣時間 06:20、18:20 執行。GitHub 實際啟動時間可能延遲。使用現有 `WORKER_API_URL` 與 `COLLECTOR_SECRET`，不新增 AI 金鑰或套件。
- 「更新作者文章」啟動背景工作；「重新載入文章」讀取已保存資料。前者不等於立即完成全部歷史匯入。近期 15 分鐘已成功更新時優先重新載入既有結果。
- 來源是 Substack 公開介面，可能限流、變更或拒絕匿名請求；會顯示來源錯誤並保留既有內容。本次執行環境無法直接存取作者文章端點，實際文章數及內容可取得程度須於正式工作執行後確認，測試使用 fixtures。

## 管理、API 與部署

管理頁面新增兩個可全域或按使用者設定的開關：`news_calendar.substack` 控制文章、標記與使用者 API；`news_calendar.substack_import` 控制新增作者。關閉顯示不刪除文章，既有作者排程繼續更新。美股市場關閉時不提供使用者 Substack API。

共用資料首次呼叫 API 時自動建立 `substack_authors`、`substack_articles`，不需手動 migration。列表僅回傳文章資訊與標的；點文章才讀取公開內文。共用文章不含個人的 AI 觀點整理。

沿用現有 GitHub Pages 前端與 Cloudflare Pages API Git 整合；合併後需兩者完成部署。Cloudflare build command 保持 `npm ci && node scripts/build_cloudflare_pages.mjs`，輸出目錄保持 `cloudflare-api`。後端更新成功後，首次點「更新作者文章」或執行 `Update Substack articles` 工作開始導入預設作者；首次歷史匯入可能需多次排程。

API：`GET/POST /substack/authors`、`GET /substack/articles?offset=0`、`GET /substack/article?id=...`、`POST /substack/refresh`。收集端使用 `GET /admin/substack/authors` 與 `POST /admin/substack/update`；僅既有 collector secret 可用。AI 成果種類新增 `substack`，沿用 `/account-results` 的登入帳號隔離及來源資訊欄位。

驗證：`npm test`（包含美股 DOM 整合）、`python -m unittest discover -s tests -p 'test_substack_sync.py'`、`npm run build`、`node scripts/build_cloudflare_pages.mjs`。
