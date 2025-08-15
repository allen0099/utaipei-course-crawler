# utaipei-course-crawler

北市大課程系統爬蟲。

## 專案設定與執行

本專案使用 TypeScript 開發，並利用 `fetch` API 進行網頁內容抓取。

### 1. 安裝依賴

請確保您已安裝 [pnpm](https://pnpm.io/)。然後執行以下命令安裝專案所需的所有依賴：

```bash
pnpm install
```

### 2. 編譯 TypeScript

在執行專案之前，您需要將 TypeScript 原始碼編譯為 JavaScript。執行以下命令：

```bash
npx tsc
```

這將會把編譯後的 JavaScript 檔案輸出到 `dist/` 目錄中。

### 核心模組

- `tools/fetcher.ts`: 負責網頁內容的抓取，使用原生 `fetch` API 實現重試機制。

## TODO

- [ ] 公告爬取
- [ ] 課程爬取
- [ ] 課程時間表爬取
- [ ] GitHub Actions 自動化

## 資料

你可以切換到 `gh-pages` 分支查看或下載抓取的資料
