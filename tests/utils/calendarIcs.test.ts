import { describe, expect, it } from "vitest";

import { generateCalendarIcs } from "@/utils/calendarIcs";
import type { CalendarEvent } from "@/utils/pdfCalendar";

const singleDay: CalendarEvent = {
  date: "2026-02-28",
  unit: "教",
  title: "和平紀念日(放假一日)",
  isHoliday: true,
};

const multiDay: CalendarEvent = {
  date: "2026-04-13",
  endDate: "2026-04-17",
  unit: "教",
  title: "114學年度第2學期期中考試",
  isHoliday: false,
};

const build = (events: CalendarEvent[]): string =>
  generateCalendarIcs(events, 114, 2, "本校 114 學年度下學期行事曆");

describe("generateCalendarIcs", () => {
  it("wraps events in a VCALENDAR with CRLF line endings", () => {
    const ics = build([singleDay]);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("\r\nEND:VCALENDAR")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:本校 114 學年度下學期行事曆");
  });

  it("ends a single-day event on the following day (DTEND is exclusive)", () => {
    const ics = build([singleDay]);

    expect(ics).toContain("DTSTART;VALUE=DATE:20260228");
    expect(ics).toContain("DTEND;VALUE=DATE:20260301");
  });

  it("ends a multi-day event the day after endDate", () => {
    const ics = build([multiDay]);

    expect(ics).toContain("DTSTART;VALUE=DATE:20260413");
    expect(ics).toContain("DTEND;VALUE=DATE:20260418");
  });

  it("prefixes the summary with the unit and tags holidays", () => {
    const ics = build([singleDay, multiDay]);

    expect(ics).toContain("SUMMARY:【教】和平紀念日(放假一日)");
    expect(ics.match(/CATEGORIES:放假/g)).toHaveLength(1);
  });

  it("keeps UIDs stable across runs so subscribers update instead of duplicating", () => {
    expect(build([singleDay, multiDay])).toBe(build([singleDay, multiDay]));
    expect(build([singleDay])).toContain("UID:114-2-2026-02-28-0@utaipei-course-helper");
  });

  it("escapes characters that are delimiters in iCalendar TEXT values", () => {
    const ics = build([{ ...singleDay, title: "甲;乙,丙" }]);

    expect(ics).toContain("SUMMARY:【教】甲\\;乙\\,丙");
  });

  it("folds lines longer than 75 octets, counting bytes rather than characters", () => {
    const ics = build([{ ...singleDay, title: "長".repeat(80) }]);
    const encoder = new TextEncoder();

    expect(ics).toContain("\r\n ");
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("never splits a multi-byte character across a fold", () => {
    const ics = build([{ ...singleDay, title: "長".repeat(80) }]);

    expect(ics).not.toContain("�");
    // 摺行只是換行表示法，去掉「CRLF + 空白」後應還原成原字串
    expect(ics.replaceAll("\r\n ", "")).toContain(`SUMMARY:【教】${"長".repeat(80)}`);
  });
});
