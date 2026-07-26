import { describe, expect, it } from "vitest";

import { splitCourseSchedule } from "@/utils/text";

// Every sample below is a real cell taken from ag304_03.jsp (【班級排課清單】),
// except the synthetic multi-teacher ones, which mirror the shapes already seen
// in locations.json.
describe("splitCourseSchedule", () => {
  describe("single teacher, time and classroom", () => {
    it("splits the three parts", () => {
      expect(splitCourseSchedule("盧東華 (一)6-8(博愛G313)")).toEqual({
        teachers: "盧東華",
        times: "(一) 6-8",
        classrooms: "博愛 G313",
      });
    });

    it("handles a single period (no range)", () => {
      expect(splitCourseSchedule("王小明 (三)3")).toEqual({
        teachers: "王小明",
        times: "(三) 3",
        classrooms: "",
      });
    });
  });

  describe("classrooms containing parentheses", () => {
    it("keeps the nested group instead of truncating at the first ')'", () => {
      expect(splitCourseSchedule("蔡妙梧 (三)3-4(博愛B101舞蹈教室(一))")).toEqual({
        teachers: "蔡妙梧",
        times: "(三) 3-4",
        classrooms: "博愛 B101 舞蹈教室 (一)",
      });
    });

    it("does not mistake the nested '(一)' for a weekday", () => {
      const { times } = splitCourseSchedule("蔡妙梧 (三)3-4(博愛B101舞蹈教室(一))");

      expect(times).toBe("(三) 3-4");
    });
  });

  describe("週別 (week type) markers are stripped", () => {
    it("removes a leading (單週) marker", () => {
      expect(splitCourseSchedule("(單週)陳鯨太 (二)6-7(博愛G313)")).toEqual({
        teachers: "陳鯨太",
        times: "(二) 6-7",
        classrooms: "博愛 G313",
      });
    });

    it("removes a trailing (雙週) marker", () => {
      expect(splitCourseSchedule("陳鯨太 (二)6-7(博愛G313)(雙週)")).toEqual({
        teachers: "陳鯨太",
        times: "(二) 6-7",
        classrooms: "博愛 G313",
      });
    });
  });

  describe("multiple time slots in one cell", () => {
    it("keeps every slot when the slots are adjacent with no classroom", () => {
      // The regression this guards: "(二)" directly after a slot is the next
      // slot, not that slot's classroom.
      expect(splitCourseSchedule("張國韋 (一)8-10 (二)8-10 (四)8-10")).toEqual({
        teachers: "張國韋",
        times: "(一) 8-10 (二) 8-10 (四) 8-10",
        classrooms: "",
      });
    });

    it("pairs each teacher with their own slot and room", () => {
      expect(
        splitCourseSchedule("王小明 (一)1-2(教室A) 李小華 (三)3-4(教室B)"),
      ).toEqual({
        teachers: "王小明, 李小華",
        times: "(一) 1-2 (三) 3-4",
        classrooms: "教室 A, 教室 B",
      });
    });
  });

  describe("未定 (TBD) values", () => {
    it("keeps '教師未定' as the teacher", () => {
      expect(splitCourseSchedule("教師未定 (二)6-7(博愛G313)")).toEqual({
        teachers: "教師未定",
        times: "(二) 6-7",
        classrooms: "博愛 G313",
      });
    });

    it("keeps '博愛教室未定' as the classroom", () => {
      expect(splitCourseSchedule("錢薇娟 (一)10-11(博愛教室未定)")).toEqual({
        teachers: "錢薇娟",
        times: "(一) 10-11",
        classrooms: "博愛教室未定",
      });
    });

    it("still finds the teacher when there is no time slot at all", () => {
      expect(splitCourseSchedule("王小明時間未定 (教室未定)")).toEqual({
        teachers: "王小明",
        times: "",
        classrooms: "教室未定",
      });
    });
  });

  describe("edge cases", () => {
    it("returns empty strings for empty input", () => {
      expect(splitCourseSchedule("")).toEqual({
        teachers: "",
        times: "",
        classrooms: "",
      });
    });

    it("deduplicates repeated entries", () => {
      expect(
        splitCourseSchedule("王小明 (一)1-2(G313) 王小明 (一)1-2(G313)"),
      ).toEqual({
        teachers: "王小明",
        times: "(一) 1-2",
        classrooms: "G313",
      });
    });
  });
});
