import type { CalendarEvent } from "@/utils/pdfCalendar";

const MAX_OCTETS = 75;
const encoder = new TextEncoder();

/**
 * RFC 5545 規定單行不得超過 75 octet，超出需以「CRLF + 單一空白」摺行。
 *
 * 上限是位元組而非字元數：中文一字佔 3 octet，若按字元數切，一行會超標近三倍。
 * 續行開頭的空白本身也算 1 octet，故續行實際只剩 74。切點一律落在字元邊界上，
 * 以免把一個多位元組字元劈成兩半。
 */
const foldLine = (line: string): string => {
  if (encoder.encode(line).length <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let current = "";
  let octets = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    // 第一行可用滿 75 octet，續行要扣掉開頭那個空白
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;

    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }

    current += char;
    octets += size;
  }

  if (current) parts.push(current);

  return parts.join("\r\n ");
};

/** TEXT 型別值需轉義反斜線、分號、逗號與換行。 */
const escapeText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** YYYY-MM-DD → YYYYMMDD */
const toIcsDate = (isoDate: string): string => isoDate.replaceAll("-", "");

/** 全天事件的 DTEND 是 exclusive，因此結束日要再加一天。 */
const nextDay = (isoDate: string): string => {
  const date = new Date(`${isoDate}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
};

/**
 * 產生學期行事曆的 iCalendar 內容（全天事件）。
 *
 * UID 以「學年度-學期-日期-序號」組成而非隨機值，重爬時同一事件的 UID 不變，
 * 訂閱端才會視為更新而不是每次都新增一筆。
 */
export const generateCalendarIcs = (
  events: CalendarEvent[],
  year: number,
  semester: number,
  calendarName: string,
): string => {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UTC Course Helper//Academic Calendar//ZH-TW",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`),
    "X-WR-TIMEZONE:Asia/Taipei",
  ];

  // 內容不隨執行時間改變，固定 DTSTAMP 可避免每次重爬都產生 diff
  const stamp = `${toIcsDate(`${year + 1911}-01-01`)}T000000Z`;

  events.forEach((event, index) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${year}-${semester}-${event.date}-${index}@utaipei-course-helper`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(event.date)}`,
      `DTEND;VALUE=DATE:${toIcsDate(nextDay(event.endDate ?? event.date))}`,
      foldLine(
        `SUMMARY:${escapeText(event.unit ? `【${event.unit}】${event.title}` : event.title)}`,
      ),
      "TRANSP:TRANSPARENT",
    );

    if (event.isHoliday) lines.push("CATEGORIES:放假");

    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
};
