import fs from "fs";

import { generateCalendarIcs } from "@/utils/calendarIcs";
import { checkPath, writeJson } from "@/utils/dir";
import { fetcher, fetchSinglePage } from "@/utils/fetcher";
import { parseCalendarPdf } from "@/utils/pdfCalendar";
import { spacing } from "@/utils/text";

interface calendarItem {
  year: number;
  semester: number;
  title: string;
  link: string;
  // PDF 是否成功解析成結構化事件；false 時前端只呈現 PDF 原件。
  // 105 學年度的 PDF 中文是逐字點陣圖，抽不出文字。
  parsed: boolean;
}

/**
 * 解析單一學期的 PDF，成功則寫出結構化事件與可訂閱的 .ics。
 * 解析失敗不應中斷整批爬取，回傳是否成功交由呼叫端標記。
 */
const writeParsedCalendar = async (
  data: Uint8Array,
  item: Omit<calendarItem, "parsed">,
): Promise<boolean> => {
  const { year, semester, title } = item;

  let events;

  try {
    events = await parseCalendarPdf(data);
  } catch (e: any) {
    console.error(`[calendar] ${title} 解析失敗：${e.message}`);

    return false;
  }

  if (events.length === 0) {
    console.warn(`[calendar] ${title} 沒有解析到任何事件，僅保留 PDF。`);

    return false;
  }

  await writeJson(`./dist/calendar/${year}/${semester}.json`, events);
  await fs.promises.writeFile(
    checkPath(`./dist/calendar/${year}/${semester}.ics`),
    generateCalendarIcs(events, year, semester, title),
  );
  console.log(`[calendar] ${title} 解析出 ${events.length} 筆事件。`);

  return true;
};

const fetchCalendar = async () => {
  const setUrl = "https://adeva.utaipei.edu.tw/p/412-1061-73.php";

  const $ = await fetchSinglePage(setUrl);
  const data = $("#Dyn_2_2 > div > div > section > div > div > div > p");

  const pending: Promise<calendarItem>[] = [];

  data.each((_, el) => {
    $(el)
      .find("a")
      .each((_, element) => {
        const text = $(element).text().trim(); // 本校114學年度下學期行事曆
        const link = $(element).attr("href"); // /var/file/61/1061/img/673214137.pdf

        if (!link) return; // Skip if no link is found

        const year = parseInt(text.match(/(\d{3})/g)?.[0] || "0");
        const semester = text.includes("上學期") ? 1 : 2;
        const title = spacing(text);
        const fullLink = `https://adeva.utaipei.edu.tw${link}`;
        const item = { year, semester, title, link: fullLink };

        pending.push(
          fetcher
            .download(fullLink, `./dist/calendar/${year}/${title}.pdf`)
            .then(async (pdf) => ({ ...item, parsed: await writeParsedCalendar(pdf, item) })),
        );
      });
  });

  const results = await Promise.all(pending);

  // Sort results by year and semester
  results.sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year; // Sort by year first
    }

    return a.semester - b.semester; // Then by semester
  });

  await writeJson("./dist/calendar.json", results);
};

(async () => {
  await fetchCalendar();
  console.log("Calendar data fetched and saved successfully!");
})();
