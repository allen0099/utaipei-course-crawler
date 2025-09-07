import pLimit from "p-limit";
import { CookieJar } from "tough-cookie";

import { YearAndSemester } from "@/interfaces/globals";
import { login } from "@/utils/authFetcher";
import { LoadYMS } from "@/utils/common";
import { writeJson } from "@/utils/dir";
import { fetcher } from "@/utils/fetcher";
import { spacing } from "@/utils/text";

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

  // Limit concurrent requests to 10, to avoid overwhelming the server
  const limit = pLimit(10);

  const locationPromises = data
    .toArray()
    .map((el) => {
      const value = $(el).val();
      const text = $(el).text().trim();

      if (value && text) {
        if (Array.isArray(value)) throw new Error("Unexpected array value");

        return limit(() =>
          fetchCourses(yms, value, jar).then((courses) => ({
            code: value,
            name: spacing(text),
            courses,
          })),
        );
      }

      return null;
    })
    .filter(Boolean) as Promise<Location>[]; // 過濾掉 null

  const locations = await Promise.all(locationPromises);

  await writeJson(`./dist/${year}/${semester}/locations.json`, locations);
};

(async () => {
  const authJar = await login();

  const results: YearAndSemester[] = await LoadYMS();

  const jobs: Promise<void>[] = [];
  // Find default equals to true, and get the year for the true item
  const defaultItem = results.find((item) => item.default);

  if (defaultItem) {
    const [year] = defaultItem.code.split("#");

    // Add all results with the same year as the default item
    results.forEach((item) => {
      const [itemYear] = item.code.split("#");

      if (itemYear === year) {
        jobs.push(fetchLocations(item.code, authJar));
      } else console.log(`Skip fetching locations for ${item.code}`);
    });
  }
  await Promise.all(jobs);
  console.log("All locations fetched!");
})();
