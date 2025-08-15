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
