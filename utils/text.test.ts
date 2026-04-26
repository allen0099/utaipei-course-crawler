import { describe, expect, it } from "vitest";

import { spacing, unifyString } from "./text";

describe("unifyString", () => {
  it("trims leading and trailing whitespace", () => {
    expect(unifyString("  hello  ")).toBe("hello");
  });

  it("normalizes newline followed by indentation into a single space", () => {
    expect(unifyString("三、\n              繳費期間如有金額異動")).toBe(
      "三、 繳費期間如有金額異動",
    );
  });

  it("normalizes multiple internal spaces into a single space", () => {
    expect(unifyString("A   B")).toBe("A B");
  });

  it("removes non-breaking spaces (U+00A0)", () => {
    expect(unifyString("hello\u00A0world")).toBe("helloworld");
  });

  it("replaces full-width left parenthesis with half-width", () => {
    expect(unifyString("（增加）")).toBe("(增加)");
  });

  it("replaces full-width right parenthesis with half-width", () => {
    expect(unifyString("減少）")).toBe("減少)");
  });

  it("handles combined: newline + indentation + full-width parentheses", () => {
    // Simulates a real HTML text node: 三、\n              繳費期間如有金額異動（增加或減少）
    expect(
      unifyString("三、\n              繳費期間如有金額異動（增加或減少）"),
    ).toBe("三、 繳費期間如有金額異動(增加或減少)");
  });

  it("returns empty string unchanged", () => {
    expect(unifyString("")).toBe("");
  });
});

describe("spacing", () => {
  it("returns empty string for empty input", () => {
    expect(spacing("")).toBe("");
  });

  it("normalizes whitespace before applying pangu spacing", () => {
    const result = spacing(
      "三、\n              繳費期間如有金額異動 (增加或減少) 者，不適用信用卡及智慧支付繳費",
    );
    expect(result).not.toContain("\n");
    expect(result).not.toMatch(/\s{2,}/); // no consecutive whitespace
    expect(result).toContain("三、");
    expect(result).toContain("繳費期間如有金額異動");
  });
});
