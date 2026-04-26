import { describe, expect, it } from "vitest";

import { convertChineseNumber, unifyString } from "@/utils/text";

describe("unifyString", () => {
  it("trims leading and trailing whitespace", () => {
    expect(unifyString("  hello  ")).toBe("hello");
  });

  it("converts full-width opening bracket to half-width", () => {
    expect(unifyString("（hello")).toBe("(hello");
  });

  it("converts full-width closing bracket to half-width", () => {
    expect(unifyString("hello）")).toBe("hello)");
  });

  it("converts both full-width brackets", () => {
    expect(unifyString("（hello）")).toBe("(hello)");
  });

  it("removes ideographic (full-width) spaces", () => {
    // U+3000 IDEOGRAPHIC SPACE
    expect(unifyString("hello\u3000world")).toBe("helloworld");
  });

  it("preserves regular ASCII spaces", () => {
    expect(unifyString("hello world")).toBe("hello world");
  });

  it("handles combined transformations", () => {
    expect(unifyString("  （test）\u3000hello  ")).toBe("(test)hello");
  });

  it("returns empty string unchanged", () => {
    expect(unifyString("")).toBe("");
  });
});

describe("convertChineseNumber", () => {
  it.each([
    ["一", 1],
    ["二", 2],
    ["三", 3],
    ["九", 9],
  ])("converts single digit %s to %d", (input, expected) => {
    expect(convertChineseNumber(input)).toBe(expected);
  });

  it("converts 十 to 10", () => {
    expect(convertChineseNumber("十")).toBe(10);
  });

  it("converts 十五 to 15", () => {
    expect(convertChineseNumber("十五")).toBe(15);
  });

  it("converts 二十 to 20", () => {
    expect(convertChineseNumber("二十")).toBe(20);
  });

  it("converts 九十九 to 99 (ROC year format)", () => {
    expect(convertChineseNumber("九十九")).toBe(99);
  });

  it("converts 一百 to 100", () => {
    expect(convertChineseNumber("一百")).toBe(100);
  });

  it("converts 一百一十 to 110", () => {
    expect(convertChineseNumber("一百一十")).toBe(110);
  });

  it("converts 一百一十三 to 113", () => {
    expect(convertChineseNumber("一百一十三")).toBe(113);
  });

  it("converts 一百一十四 to 114 (current ROC year)", () => {
    expect(convertChineseNumber("一百一十四")).toBe(114);
  });

  it("converts 兩 as alias for 二", () => {
    expect(convertChineseNumber("兩")).toBe(2);
  });

  it("throws on invalid characters", () => {
    expect(() => convertChineseNumber("abc")).toThrow();
  });
});
