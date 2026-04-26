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
