import fs from "fs";

import { YearAndSemester } from "@/interfaces/globals";
import { login } from "@/utils/authFetcher";
import { writeJson } from "@/utils/dir";
import { fetchSinglePage } from "@/utils/fetcher";
import { convertChineseNumber, spacing } from "@/utils/text";

const reYear = /(\D{2,4})學年度?/;
const reSemester = /第([一二三四五六七八九])學期/;

export const LoadYMS = async (): Promise<YearAndSemester[]> => {
  const targetFile = "./dist/yms.json";

  if (fs.existsSync(targetFile)) {
    const data = await fs.promises.readFile(targetFile, "utf-8");

    console.log("[LoadYMS] Load from existing file.");

    return JSON.parse(data) as YearAndSemester[];
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

  await writeJson("./dist/yms.json", results);

  return results;
};
