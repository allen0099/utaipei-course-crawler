# utaipei-course-crawler

北市大課程系統爬蟲。

## 專案設定與執行

本專案使用 TypeScript 開發。

請確保您已安裝 [pnpm](https://pnpm.io/)。然後執行以下命令安裝專案所需的所有依賴：

### Commands

```bash
pnpm install
npx tsc

# 執行 ts 檔案
tsx xxx.ts
```

### 核心模組

- `utils/fetcher.ts`: 負責網頁內容的抓取，使用原生 `fetch` API 實現重試機制。
- `utils/text.ts`: 提供文本處理的工具函數。

## TODO

- [x] [公告](https://allen0099.github.io/utaipei-course-crawler/announcement.json)
- [ ] 歷史課程

## 資料

你可以切換到 `gh-pages` 分支查看或下載抓取的資料
