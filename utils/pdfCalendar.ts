import type { PDFDocumentProxy, TextItem } from "pdfjs-dist/types/src/display/api";

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export interface CalendarEvent {
  date: string; // YYYY-MM-DD
  endDate?: string; // 僅跨日區間才有，YYYY-MM-DD
  unit: string | null; // 【】內的主辦單位，如「教」「秘」
  title: string;
  isHoliday: boolean;
}

/** 記事欄左界找不到時的保底值；行事曆版面十年未變，日期格最右緣固定在 x≈221。 */
const FALLBACK_TEXT_COLUMN_X = 224;

/** 同一列的 y 容差。相鄰列間距約 15pt，而同列內字元最多偏移 1.5pt。 */
const ROW_TOLERANCE = 4;

const WEEKDAY_HEADERS = ["一", "二", "三", "四", "五", "六", "日"];

/** 認定為表頭列所需的星期標題數量；容忍個別字元抽取失敗。 */
const MIN_WEEKDAY_HEADERS = 5;

const MONTH_CELL = /^(\d{3})\/(\d{2})$/;
const LEADING_DAY = /^\[(\d{1,2})\]/;

// 「4月13日–4月17日」「17日-19日」；分隔符 ASCII 與全形都出現過
const DATE_RANGE = /(?:(\d{1,2})月)?(\d{1,2})日\s*[-–—~～至]\s*(?:(\d{1,2})月)?(\d{1,2})日/;

const HOLIDAY = /放假|補假/;

/**
 * 「(於4月2日彈性放假)」「(補6月13日畢業典禮)」這類括號是在交代補假的對應日期，
 * 不代表本事件當天放假。判斷是否為假日前先把它們拿掉，才不會把畢業典禮誤標成放假。
 * 「(放假一日)」這種直述型括號不在此列，必須保留。
 */
const CROSS_REFERENCE_NOTE = /[(（][於補][^)）]*[)）]/g;

interface Positioned {
  str: string;
  x: number;
  y: number;
  width: number;
}

/** 民國年月日 → 西元 YYYY-MM-DD。 */
const toISODate = (rocYear: number, month: number, day: number): string =>
  `${rocYear + 1911}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/**
 * 把一頁的文字項目依 y 座標分群成列，列內依 x 由左至右排序。
 * 用貪婪聚類而非固定分桶，避免剛好落在桶邊界的字元被切到隔壁列。
 */
const groupIntoRows = (items: Positioned[]): Positioned[][] => {
  const rows: Positioned[][] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y);

  for (const item of sorted) {
    const last = rows[rows.length - 1];

    if (last && Math.abs(last[0].y - item.y) <= ROW_TOLERANCE) last.push(item);
    else rows.push([item]);
  }

  return rows.map((row) => row.sort((a, b) => a.x - b.x));
};

/**
 * 找出表頭列（含「一二三四五六日」七個獨立項目的那一列），回傳其 y 與記事欄左界。
 *
 * 表頭同時界定了兩件事：記事欄從星期標題最右緣之後開始，以及標題／表頭區到此為止，
 * 之下才是資料列。每頁都有自己的表頭，必須逐頁重新定位，否則第二頁的表頭會被當成記事。
 */
const findHeader = (rows: Positioned[][]): { y: number; textColumnX: number } | null => {
  for (const row of rows) {
    const headers = row.filter((i) => WEEKDAY_HEADERS.includes(i.str.trim()));

    if (headers.length < MIN_WEEKDAY_HEADERS) continue;

    const textColumnX = Math.max(...headers.map((i) => i.x + i.width)) + 3;

    return { y: row[0].y, textColumnX };
  }

  return null;
};

/** 一列的原始輸出：所屬月份 + 記事欄文字。 */
interface RawLine {
  rocYear: number;
  month: number;
  text: string;
}

const extractLines = async (doc: PDFDocumentProxy): Promise<RawLine[]> => {
  const lines: RawLine[] = [];

  // 月份只在該月第一列出現一次，且會跨頁延續
  let rocYear = 0;
  let month = 0;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const items: Positioned[] = content.items
      .filter((i): i is TextItem => "str" in i && i.str.trim() !== "")
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width }));

    const rows = groupIntoRows(items);
    const header = findHeader(rows);
    const textColumnX = header ? header.textColumnX : FALLBACK_TEXT_COLUMN_X;

    for (const row of rows) {
      // 略過標題與表頭；資料列一律在表頭之下（y 較小）
      if (header && row[0].y >= header.y) continue;

      const monthCell = row.map((i) => MONTH_CELL.exec(i.str.trim())).find(Boolean);

      if (monthCell) {
        rocYear = parseInt(monthCell[1], 10);
        month = parseInt(monthCell[2], 10);
      }

      const text = row
        .filter((i) => i.x >= textColumnX)
        .map((i) => i.str)
        .join("")
        .trim();

      if (text && month > 0) lines.push({ rocYear, month, text });
    }
  }

  return lines;
};

/**
 * 併回續行。事件過長時會換到下一列並縮排，該列不以 [DD] 開頭。
 */
const mergeContinuations = (lines: RawLine[]): RawLine[] => {
  const merged: RawLine[] = [];

  for (const line of lines) {
    if (LEADING_DAY.test(line.text)) merged.push({ ...line });
    else if (merged.length > 0) merged[merged.length - 1].text += line.text;
  }

  return merged;
};

/**
 * 由事件內文推出跨日區間，並在區間寫在開頭時（如「4月13日–4月17日期中考試」）
 * 把它從標題移除——日期已經結構化到 date/endDate，留在標題只是重複。
 * 若日期出現在句中（如「彈性放假(補6月13日畢業典禮)」）則原樣保留。
 */
const parseDateRange = (
  title: string,
  rocYear: number,
  startMonth: number,
): { title: string; endDate?: string } => {
  const match = DATE_RANGE.exec(title);

  if (!match) return { title };

  const endMonth = match[3] ? parseInt(match[3], 10) : parseInt(match[1] ?? "", 10) || startMonth;
  const endDay = parseInt(match[4], 10);

  // 跨年度（如 12 月底跨到 1 月）時民國年要進位
  const endRocYear = endMonth < startMonth ? rocYear + 1 : rocYear;
  const stripped = match.index === 0 ? title.slice(match[0].length).trim() : title;

  return {
    title: stripped || title,
    endDate: toISODate(endRocYear, endMonth, endDay),
  };
};

/** 把一列記事拆成獨立事件。同列以 ；/; 分段，後段省略【單位】時沿用前段的。 */
const splitEvents = (line: RawLine): CalendarEvent[] => {
  const day = parseInt(LEADING_DAY.exec(line.text)![1], 10);
  const body = line.text.replace(LEADING_DAY, "");
  const date = toISODate(line.rocYear, line.month, day);

  const events: CalendarEvent[] = [];
  let unit: string | null = null;

  for (const segment of body.split(/[；;]/)) {
    const trimmed = segment.trim();

    if (!trimmed) continue;

    const tagged = /^【(.+?)】(.*)$/.exec(trimmed);
    const raw = (tagged ? tagged[2] : trimmed).trim();

    if (tagged) unit = tagged[1];
    if (!raw) continue;

    const { title, endDate } = parseDateRange(raw, line.rocYear, line.month);

    events.push({
      date,
      ...(endDate && endDate !== date ? { endDate } : {}),
      unit,
      title,
      isHoliday: HOLIDAY.test(title.replace(CROSS_REFERENCE_NOTE, "")),
    });
  }

  return events;
};

/**
 * 解析行事曆 PDF 為結構化事件。
 *
 * 版面是固定的欄位式表格（月份 / 週次 / 七天日期格 / 記事事項），依 x 座標切出記事欄，
 * 依 y 座標分列，即可穩定取得「[DD]【單位】說明」形式的記事。104～114 學年度格式一致。
 *
 * 105 學年度的 PDF 中文是逐字點陣圖、字型只含數字標點，抽不出記事文字，
 * 此時回傳空陣列而非拋錯，由呼叫端標記為未解析並改用 PDF 原件呈現。
 */
export const parseCalendarPdf = async (data: Uint8Array): Promise<CalendarEvent[]> => {
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: false });
  const doc: PDFDocumentProxy = await loadingTask.promise;

  try {
    const lines = mergeContinuations(await extractLines(doc));

    return lines.flatMap(splitEvents);
  } finally {
    await loadingTask.destroy();
  }
};
