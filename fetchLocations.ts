import { fetcher, fetchSinglePage } from "@/utils/fetcher";
import { login } from "@/utils/authFetcher";
import { convertChineseNumber, spacing } from "@/utils/text";
import { writeJson } from "@/utils/dir";
import { CookieJar } from "tough-cookie";

interface YearAndSemester {
  code: string;
  displayName: string;
  default: boolean;
}

interface CourseItem {
  code: string;
  name: string;
  class: string;
  time: string;
  teacher: string;
}

interface Location {
  code: string;
  name: string;
  courses: CourseItem[];
}

const reYear = /(\D{2,4})學年度?/;
const reSemester = /第([一二三四五六七八九])學期/;

const fetchCourses = async (yms: string, courseId: string, jar: CookieJar) => {
  const [year, semester] = yms.split("#");
  const url = "https://my.utaipei.edu.tw/utaipei/ag_pro/ag302_02.jsp";

  const params = new URLSearchParams({
    yms_yms: yms,
    room_id: courseId,
    ls_year: year,
    ls_sms: semester,
  });

  const $ = await fetcher.authPost(url, params, jar);
  const data = $('body > form > table > tbody > tr[bgcolor="#fffcee"]');

  const results: CourseItem[] = [];

  data.each((_, el) => {
    const row = $(el).find("td");

    results.push({
      code: row.eq(0).text().trim(),
      name: spacing(row.eq(1).text().trim()),
      class: spacing(row.eq(2).text().trim()),
      time: spacing(row.eq(8).text().trim()),
      teacher: spacing(row.eq(9).text().trim()),
    });
  });

  return results;
};

const fetchLocations = async (yms: string, jar: CookieJar) => {
  const [year, semester] = yms.split("#");
  const url = "https://my.utaipei.edu.tw/utaipei/ag_pro/ag302_01.jsp";

  const params = new URLSearchParams({
    yms_yms: yms,
    ls_year: year,
    ls_sms: semester,
  });

  const $ = await fetcher.authPost(url, params, jar);
  const data = $(
    "body > form > table > tbody > tr:nth-child(2) > td > font > select:nth-child(2) option",
  );

  const locations: Location[] = [];

  for (const el of data.toArray()) {
    const value = $(el).val();
    const text = $(el).text().trim();
    if (value && text) {
      if (Array.isArray(value)) throw new Error("Unexpected array value");
      const courses = await fetchCourses(yms, value, jar);
      locations.push({
        code: value,
        name: spacing(text),
        courses,
      });
    }
  }

  await writeJson(`./dist/${year}/${semester}/locations.json`, locations);
};

const fetchYms = async () => {
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

  const jobs: Promise<void>[] = [];
  results.forEach((item) => {
    jobs.push(fetchLocations(item.code, authJar));
  });
  await Promise.all(jobs);
  console.log("All locations fetched!");

  await writeJson("./dist/yms.json", results);
};

(async () => {
  await fetchYms();
  // await fetchCourses("114#1", "0001", await login());
})();
