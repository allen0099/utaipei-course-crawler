// @ts-ignore
import pangu from "pangu";

export const unifyString = (input: string): string => {
  return input
    .trim()
    .replaceAll("　", "") // 移除全形空格
    .replaceAll("\u00A0", "") // 移除不換行空格
    .replaceAll("（", "(") // 替換全形括號為半形
    .replaceAll("）", ")") // 替換全形括號為半形
    .replace(/[ \t\n\r\f\v]+/g, " ") // 正規化空白字元（換行、多餘空格）為單一空格
    .trim(); // 再次修剪，因正規化可能留下前後空格
};

export const spacing = (text: string): string => {
  if (text) return pangu.spacingText(unifyString(text));
  else return text;
};

/**
 * Split teacher name(s) and time slot(s) from a combined course table cell.
 * @returns [teachers (comma-separated), times (space-separated)]
 * @example
 * "王小明 (一) 1-2 (教室未定)"              => ["王小明", "(一) 1-2"]
 * "王小明時間未定 (教室未定)"                => ["王小明", ""]
 * "王小明 (一) 1-2 (教室A) 李小華 (三) 3-4 (教室B)" => ["王小明,李小華", "(一) 1-2 (三) 3-4"]
 * "王小明 (教室未定)"                        => ["王小明", ""]
 */
export const splitTeacherAndTime = (input: string): [string, string] => {
  const cleanedInput = spacing(input)
    .replaceAll("(單週)", "")
    .replaceAll("(雙週)", "")
    .replaceAll("\n", "");

  const teachers: string[] = [];
  const times: string[] = [];

  const timeRegex = /\([一二三四五六日]\)\s*\d+(-\d+)?/g;
  const teacherRegex = /([^\s()]+)(?=\s*\([一二三四五六日]\))/g;
  const timeUndefinedRegex = /([^\s()]+)\s*時間未定/g;
  const locationUndefinedRegex = /([^\s()]+)\s*\(教室未定\)/g;

  let match: RegExpExecArray | null;

  while ((match = timeRegex.exec(cleanedInput)) !== null) {
    times.push(match[0].trim());
  }

  while ((match = teacherRegex.exec(cleanedInput)) !== null) {
    teachers.push(match[1].trim());
  }

  while ((match = timeUndefinedRegex.exec(cleanedInput)) !== null) {
    teachers.push(match[1].trim());
  }

  while ((match = locationUndefinedRegex.exec(cleanedInput)) !== null) {
    const tmpTeacher = match[1].trim();

    if (tmpTeacher.endsWith("時間未定")) continue; // already captured by timeUndefinedRegex
    if (/^\d+(-\d+)?$/.test(tmpTeacher)) continue; // numeric time-slot, not a teacher name
    teachers.push(tmpTeacher);
  }

  const uniqueTeachers = Array.from(new Set(teachers));
  const uniqueTimes = Array.from(new Set(times));

  return [uniqueTeachers.join(","), uniqueTimes.join(" ")];
};

export interface CourseSchedule {
  /** Comma-separated teacher names, e.g. "王小明, 李小華" */
  teachers: string;
  /** Space-separated time slots, e.g. "(一) 6-8 (三) 3-4" */
  times: string;
  /** Comma-separated classrooms, e.g. "博愛 G313" */
  classrooms: string;
}

/** Index of the ")" matching the "(" at `open`, or -1 when unbalanced. */
const matchingParen = (text: string, open: number): number => {
  let depth = 0;

  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
};

/** Drop the "時間未定" marker and anything that isn't a plausible name. */
const cleanTeacherName = (input: string): string => {
  const name = unifyString(input)
    .replace(/時間未定$/, "")
    .trim();

  // A bare time slot ("3-4") or leftover punctuation is not a teacher.
  if (!name || /^[\d\s\-,、/]+$/.test(name)) return "";

  return name;
};

/**
 * Split the combined 「上課教師/時間/教室」 cell of 【班級排課清單】
 * (ag304_03.jsp) into its three parts.
 *
 * Unlike {@link splitTeacherAndTime} — which the teacher and location crawlers
 * use and which throws the classroom away — this keeps the classroom, the one
 * field a class timetable most needs.
 *
 * The cell repeats 「教師 (日)起-迄(校區教室)」 once per time slot. It is scanned
 * left to right rather than matched with a single regex, because the classroom
 * may itself contain parentheses ("博愛B101舞蹈教室(一)"): consuming the balanced
 * classroom group right after each time slot is also what stops that nested
 * "(一)" being mistaken for a weekday.
 *
 * @example
 * "盧東華 (一)6-8(博愛G313)"
 *   => { teachers: "盧東華", times: "(一) 6-8", classrooms: "博愛 G313" }
 * "蔡妙梧 (三)3-4(博愛B101舞蹈教室(一))"
 *   => { teachers: "蔡妙梧", times: "(三) 3-4", classrooms: "博愛 B101 舞蹈教室 (一)" }
 */
export const splitCourseSchedule = (input: string): CourseSchedule => {
  const text = spacing(input)
    .replaceAll("(單週)", "")
    .replaceAll("(雙週)", "")
    .replaceAll("\n", "");

  const teachers: string[] = [];
  const times: string[] = [];
  const classrooms: string[] = [];

  const slotRegex = /\(([一二三四五六日])\)\s*(\d+)(?:\s*-\s*(\d+))?/g;

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = slotRegex.exec(text)) !== null) {
    const teacher = cleanTeacherName(text.slice(cursor, match.index));

    if (teacher) teachers.push(teacher);

    const [, day, start, end] = match;

    times.push(end ? `(${day}) ${start}-${end}` : `(${day}) ${start}`);

    let next = match.index + match[0].length;

    // The classroom, when present, is the balanced group immediately after.
    while (text[next] === " ") next += 1;

    // …unless that group opens the next time slot instead. A course listing
    // every weekday in one cell ("(一)8-10 (二)8-10") has no classroom between
    // the slots, and swallowing "(二)" as one would drop that slot entirely.
    const nextSlotFollows = /^\([一二三四五六日]\)\s*\d/.test(text.slice(next));

    if (text[next] === "(" && !nextSlotFollows) {
      const close = matchingParen(text, next);

      if (close !== -1) {
        const classroom = unifyString(text.slice(next + 1, close));

        if (classroom) classrooms.push(classroom);
        next = close + 1;
      }
    }

    cursor = next;
    slotRegex.lastIndex = next;
  }

  // No time slot at all ("王小明時間未定 (教室未定)"): the teacher is whatever
  // remains once every parenthesised group is removed, and the first such group
  // is still the classroom.
  if (times.length === 0) {
    const teacher = cleanTeacherName(text.replace(/\([^)]*\)/g, " "));

    if (teacher) teachers.push(teacher);

    const open = text.indexOf("(");
    const close = open === -1 ? -1 : matchingParen(text, open);

    if (close !== -1) {
      const classroom = unifyString(text.slice(open + 1, close));

      if (classroom) classrooms.push(classroom);
    }
  }

  return {
    teachers: Array.from(new Set(teachers)).join(", "),
    times: Array.from(new Set(times)).join(" "),
    classrooms: Array.from(new Set(classrooms)).join(", "),
  };
};

export const convertChineseNumber = (chineseNum: string): number => {
  const digitMap: { [key: string]: number } = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  const replaceMap: { [key: string]: string } = {
    兩: "二", // Replace 兩 with 二 for simplicity
    佰: "百", // Replace 佰 with 百
    仟: "千", // Replace 仟 with 千
  };

  const unitMap: { [key: string]: number } = {
    十: 10,
    百: 100,
    千: 1000,
  };

  let total = 0;
  let currentUnit = 1; // Default unit is 1 (for digits without explicit unit)
  let currentNumber = 0; // To handle cases like "十五" (15)

  // Replace characters based on replaceMap
  for (const [key, value] of Object.entries(replaceMap)) {
    chineseNum = chineseNum.replace(new RegExp(key, "g"), value);
  }

  for (let i = 0; i < chineseNum.length; i++) {
    const char = chineseNum[i];

    if (digitMap.hasOwnProperty(char)) {
      currentNumber = digitMap[char];
    } else if (unitMap.hasOwnProperty(char)) {
      const unitValue = unitMap[char];

      if (currentNumber === 0) {
        // Handle cases like "十" (10), "百" (100) without leading digit
        currentNumber = 1;
      }

      total += currentNumber * unitValue;
      currentNumber = 0; // Reset current number after using it
      currentUnit = unitValue; // Update current unit
    } else {
      throw new Error(`Invalid character in Chinese number: ${char}`);
    }
  }
  total += currentNumber * (currentUnit >= 10 ? 1 : currentUnit); // Add any remaining number

  return total;
};
