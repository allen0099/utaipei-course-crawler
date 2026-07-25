import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { beforeAll, describe, expect, it } from "vitest";

import { CalendarEvent, parseCalendarPdf } from "@/utils/pdfCalendar";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

const parseFixture = (name: string): Promise<CalendarEvent[]> =>
  parseCalendarPdf(new Uint8Array(fs.readFileSync(path.join(fixtures, name))));

describe("parseCalendarPdf", () => {
  describe("114 學年度第 2 學期（雙頁）", () => {
    let events: CalendarEvent[];

    beforeAll(async () => {
      events = await parseFixture("calendar-114-2.pdf");
    });

    it("parses every event across both pages", () => {
      expect(events).toHaveLength(39);
    });

    it("converts Minguo months to Gregorian dates", () => {
      // 民國 115/02 → 西元 2026-02
      expect(events[0]).toEqual({
        date: "2026-02-01",
        unit: "教",
        title: "114學年度第2學期開始",
        isHoliday: false,
      });
    });

    it("keeps the last event on the second page", () => {
      expect(events.at(-1)).toEqual({
        date: "2026-07-31",
        unit: "教",
        title: "114學年度第2學期結束",
        isHoliday: false,
      });
    });

    it("splits one row into multiple events and inherits the omitted unit", () => {
      // 原文：[23]【教】114學年度第2學期開學日(開始上課)；註冊日
      const registration = events.filter((e) => e.date === "2026-02-23");

      expect(registration).toEqual([
        {
          date: "2026-02-23",
          unit: "教",
          title: "114學年度第2學期開學日(開始上課)",
          isHoliday: false,
        },
        { date: "2026-02-23", unit: "教", title: "註冊日", isHoliday: false },
      ]);
    });

    it("lifts a leading date range into endDate and strips it from the title", () => {
      // 原文：[13]【教】4月13日–4月17日114學年度第2學期期中考試
      expect(events).toContainEqual({
        date: "2026-04-13",
        endDate: "2026-04-17",
        unit: "教",
        title: "114學年度第2學期期中考試",
        isHoliday: false,
      });
    });

    it("marks statutory holidays", () => {
      expect(events).toContainEqual({
        date: "2026-02-28",
        unit: "教",
        title: "和平紀念日(放假一日)",
        isHoliday: true,
      });
    });

    it("does not treat a compensation cross-reference as a holiday", () => {
      // 畢業典禮當天要上班，括號只是說明補假日期
      expect(events).toContainEqual({
        date: "2026-06-13",
        unit: "學",
        title: "畢業典禮(於4月2日彈性放假)",
        isHoliday: false,
      });
      // 反之，補假來源本身確實是假日
      expect(events).toContainEqual({
        date: "2026-04-02",
        unit: "教",
        title: "彈性放假(補6月13日畢業典禮)",
        isHoliday: true,
      });
    });

    it("always resolves a unit", () => {
      expect(events.filter((e) => !e.unit)).toEqual([]);
    });
  });

  describe("104 學年度第 1 學期（最舊格式）", () => {
    let events: CalendarEvent[];

    beforeAll(async () => {
      events = await parseFixture("calendar-104-1.pdf");
    });

    it("parses the ten-year-old layout the same way", () => {
      expect(events).toHaveLength(44);
    });

    it("merges an indented continuation line back into its event", () => {
      // 原文分兩列：[10]【教】10日-14日大考中心分發之104學年度大學部新生上網
      //                  報到、登錄基本資料
      expect(events).toContainEqual({
        date: "2015-08-10",
        endDate: "2015-08-14",
        unit: "教",
        title: "大考中心分發之104學年度大學部新生上網報到、登錄基本資料",
        isHoliday: false,
      });
    });

    it("carries the start month into a range that omits it", () => {
      // 原文：[07]【教】7日-11日各系所新生、轉學生申請學分抵免（月份省略，沿用 9 月）
      expect(events).toContainEqual({
        date: "2015-09-07",
        endDate: "2015-09-11",
        unit: "教",
        title: "各系所新生、轉學生申請學分抵免",
        isHoliday: false,
      });
    });

    it("spans the Minguo new year into the next Gregorian year", () => {
      // 民國 105/01 出現在 104 學年度上學期的最後
      expect(events).toContainEqual({
        date: "2016-01-01",
        unit: "教",
        title: "中華民國開國紀念日(放假1天)",
        isHoliday: true,
      });
    });
  });

  describe("105 學年度（中文為逐字點陣圖）", () => {
    it("returns no events instead of throwing", async () => {
      await expect(parseFixture("calendar-105-1.pdf")).resolves.toEqual([]);
    });
  });
});
