import { describe, expect, it } from "vitest";

import { splitTeacherAndTime } from "@/utils/text";

describe("splitTeacherAndTime", () => {
  describe("single teacher with time", () => {
    it("parses teacher name and time slot", () => {
      const [teacher, time] = splitTeacherAndTime("王小明 (一) 1-2");
      expect(teacher).toBe("王小明");
      expect(time).toBe("(一) 1-2");
    });

    it("parses teacher when classroom is TBD — (教室未定) is ignored", () => {
      const [teacher, time] = splitTeacherAndTime("王小明 (一) 1-2 (教室未定)");
      expect(teacher).toBe("王小明");
      expect(time).toBe("(一) 1-2");
    });

    it("handles single period (no range)", () => {
      const [teacher, time] = splitTeacherAndTime("王小明 (三) 3");
      expect(teacher).toBe("王小明");
      expect(time).toBe("(三) 3");
    });
  });

  describe("time or classroom undefined", () => {
    it("parses teacher when time is TBD", () => {
      const [teacher, time] = splitTeacherAndTime("王小明時間未定 (教室未定)");
      expect(teacher).toBe("王小明");
      expect(time).toBe("");
    });

    it("parses teacher when only classroom is TBD (the bug fix case)", () => {
      // Previously teachers.push() was called without an argument, so teacher was lost
      const [teacher, time] = splitTeacherAndTime("王小明 (教室未定)");
      expect(teacher).toBe("王小明");
      expect(time).toBe("");
    });
  });

  describe("multiple teachers", () => {
    it("parses two teachers with separate time slots", () => {
      const [teacher, time] = splitTeacherAndTime(
        "王小明 (一) 1-2 (教室A) 李小華 (三) 3-4 (教室B)",
      );
      expect(teacher).toBe("王小明,李小華");
      expect(time).toBe("(一) 1-2 (三) 3-4");
    });

    it("parses two teachers when both have classroom TBD", () => {
      const [teacher, time] = splitTeacherAndTime(
        "王小明 (一) 1-2 (教室未定) 李小華 (三) 3-4 (教室未定)",
      );
      expect(teacher).toBe("王小明,李小華");
      expect(time).toBe("(一) 1-2 (三) 3-4");
    });
  });

  describe("週別 (week type) markers are stripped", () => {
    it("removes (單週) marker before parsing", () => {
      const [teacher, time] = splitTeacherAndTime("王小明 (一) 1-2 (單週)");
      expect(teacher).toBe("王小明");
      expect(time).toBe("(一) 1-2");
    });

    it("removes (雙週) marker before parsing", () => {
      const [teacher, time] = splitTeacherAndTime("王小明 (二) 3-4 (雙週)");
      expect(teacher).toBe("王小明");
      expect(time).toBe("(二) 3-4");
    });
  });

  describe("edge cases", () => {
    it("returns empty strings when input is empty", () => {
      const [teacher, time] = splitTeacherAndTime("");
      expect(teacher).toBe("");
      expect(time).toBe("");
    });

    it("deduplicates repeated teacher/time entries", () => {
      const [teacher, time] = splitTeacherAndTime("王小明 (一) 1-2 王小明 (一) 1-2");
      expect(teacher).toBe("王小明");
      expect(time).toBe("(一) 1-2");
    });
  });
});
