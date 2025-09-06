// @ts-ignore
import pangu from "pangu";

export const unifyString = (input: string): string => {
  return input
    .trim()
    .replaceAll("([^\x00-\x7F]+)", " ") // 移除非 ASCII 字符
    .replaceAll(" ", "") // 移除單個空格
    .replaceAll("（", "(") // 替換全形括號為半形
    .replaceAll("）", ")"); // 替換全形括號為半形
};

export const spacing = (text: string): string => {
  if (text) return pangu.spacingText(unifyString(text));
  else return text;
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
