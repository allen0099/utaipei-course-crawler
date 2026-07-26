import fs from "fs";

import { YearAndSemester, YmsCache } from "@/interfaces/globals";
import { login } from "@/utils/authFetcher";
import { writeJson } from "@/utils/dir";
import { fetchSinglePage } from "@/utils/fetcher";
import { convertChineseNumber, spacing } from "@/utils/text";

const reYear = /(\D{2,4})學年度?/;
const reSemester = /第([一二三四五六七八九])學期/;

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const isYmsCache = (value: unknown): value is YmsCache =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as YmsCache).lastUpdated === "string" &&
  !Number.isNaN(new Date((value as YmsCache).lastUpdated).getTime()) &&
  Array.isArray((value as YmsCache).data);

/**
 * 把命令列參數解析成要爬的學年期清單，三支 fetch* 腳本共用同一套規則：
 *
 *   `114#1`  只爬那一個學年期（不需要 LoadYMS，因此也不需要登入）
 *   `114`    爬 114 學年度的所有學期
 *   （省略）  爬學校目前學年度的所有學期
 *
 * 空字串等同省略：GitHub Actions 的 workflow input 沒填時會傳進來一個空字串，
 * 若把它當成學年度就會匹配不到任何學年期而靜靜地什麼都不做。
 */
export const resolveTargets = async (arg?: string): Promise<string[]> => {
  const value = arg?.trim();

  if (value?.includes("#")) return [value];

  const yearAndSemesters = await LoadYMS();
  const year = value || yearAndSemesters.find((item) => item.default)?.code.split("#")[0];

  if (!year) {
    console.error("[resolveTargets] No year given and no default 學年期 found.");

    return [];
  }

  const targets = yearAndSemesters
    .filter((item) => item.code.split("#")[0] === year)
    .map((item) => item.code);

  // 手動指定卻一個都對不到，多半是年份打錯。安靜地跑完 0 個學年期會讓
  // workflow 顯示成功，看起來像更新過了，所以直接失敗。
  if (targets.length === 0) {
    throw new Error(
      `找不到 ${year} 學年度的任何學期。可用的學年期：${yearAndSemesters
        .map((item) => item.code)
        .join(", ")}`,
    );
  }

  console.log(`[resolveTargets] ${year} 學年度: ${targets.join(", ")}`);

  return targets;
};

export const LoadYMS = async (): Promise<YearAndSemester[]> => {
  const targetFile = "./dist/yms.json";

  if (fs.existsSync(targetFile)) {
    const raw = await fs.promises.readFile(targetFile, "utf-8");
    const parsed: unknown = JSON.parse(raw);

    if (!isYmsCache(parsed)) {
      console.log("[LoadYMS] Existing file has an unrecognized structure, refetching...");
    } else {
      const isStale = Date.now() - new Date(parsed.lastUpdated).getTime() > ONE_MONTH_MS;

      if (!isStale) {
        console.log("[LoadYMS] Load from existing file.");

        return parsed.data;
      }

      console.log("[LoadYMS] Existing file is older than 1 month, refetching...");
    }
  }

  console.log("[LoadYMS] Fetch from server...");

  const authJar = await login();
  const url = "https://my.utaipei.edu.tw/utaipei/ag_pro/ag302_01.jsp";

  const $ = await fetchSinglePage(url, {}, authJar);
  const data = $("#yms_yms option");

  const results: YearAndSemester[] = [];

  data.each((_, el) => {
    let name = $(el).text();

    const yearMatch = name.match(reYear);
    const semesterMatch = name.match(reSemester);

    // 九十九學年度暑修一 -> 99學年度暑修一
    // 九十九學年度第一學期 (暑假) -> 99學年度第1學期 (暑假)
    if (yearMatch) {
      const yearInChinese = yearMatch[1];
      const yearInNumber = convertChineseNumber(yearInChinese);

      if (yearInNumber) {
        name = name.replace(yearInChinese, yearInNumber.toString());
      }
    }
    if (semesterMatch) {
      const semesterInChinese = semesterMatch[1];
      const semesterInNumber = convertChineseNumber(semesterInChinese);

      if (semesterInNumber) {
        name = name.replace(semesterInChinese, semesterInNumber.toString());
      }
    }

    results.push({
      code: $(el).val() as string,
      displayName: spacing(name),
      default: $(el).attr("selected") === "selected",
    });
  });

  const cache: YmsCache = {
    lastUpdated: new Date().toISOString(),
    data: results,
  };

  await writeJson("./dist/yms.json", cache);

  return results;
};
