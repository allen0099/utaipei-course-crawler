import { CheerioAPI } from "cheerio";

import { spacing } from "@/utils/text";

/**
 * Read a `<select>`'s `<option>`s into code/name pairs, dropping the "請選擇"
 * (empty value) and "所有…" (value "%") aggregate entries.
 *
 * The school's course-query forms (ag203, ag304_01) all expose their cascading
 * 學制／學院／系所 dropdowns this way, so both crawlers parse them identically.
 */
export const parseOptions = ($: CheerioAPI, id: string): { code: string; name: string }[] => {
  const items: { code: string; name: string }[] = [];

  $(`#${id} option`).each((_, el) => {
    const value = $(el).val();
    const text = $(el).text().trim();

    if (Array.isArray(value)) throw new Error("Unexpected array value");
    if (!value || value === "%" || !text) return;

    items.push({ code: value, name: spacing(text) });
  });

  return items;
};
