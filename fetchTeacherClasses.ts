import { CheerioAPI } from "cheerio";
import pLimit from "p-limit";
import { CookieJar } from "tough-cookie";

import { CourseItem, YearAndSemester } from "@/interfaces/globals";
import { login } from "@/utils/authFetcher";
import { LoadYMS } from "@/utils/common";
import { writeJson } from "@/utils/dir";
import { fetcher } from "@/utils/fetcher";
import { spacing, splitTeacherAndTime, unifyString } from "@/utils/text";

interface TeacherClasses {
  code: string;
  name: string;
  class: CourseItem[];
}

interface Units {
  code: string;
  name: string;
  teachers: TeacherClasses[];
}

const callApi = async ({
  yms,
  unit,
  jar,
  teacherCode,
}: {
  yms: string;
  jar: CookieJar;
  unit?: string;
  teacherCode?: string;
}): Promise<CheerioAPI> => {
  const url = `https://my.utaipei.edu.tw/utaipei/ag_pro/ag300_01.jsp`;

  const params = new URLSearchParams({
    yms_yms: yms,
    unit: unit || "",
    tea_str1: teacherCode || "",
  });

  return await fetcher.authPost(url, params, jar);
};

const callSecondApi = async ({
  yms,
  jar,
  teacherCode,
}: {
  yms: string;
  teacherCode: string;
  jar: CookieJar;
}): Promise<CheerioAPI> => {
  const url = `https://my.utaipei.edu.tw/utaipei/ag_pro/ag300_02.jsp`;

  const params = new URLSearchParams({
    yms_yms: yms,
    tea_str1: teacherCode || "",
    kind: "clslist", // To get list of classes
  });

  return await fetcher.authPost(url, params, jar);
};

const fetchTeacherClasses = async (yms: string, teacherCode: string, jar: CookieJar) => {
  const $ = await callSecondApi({ yms, jar, teacherCode });
  const data = $("body > form:nth-child(3) > table > tbody > tr[bgcolor='#FFFCEE']");

  const results: CourseItem[] = [];

  data.each((_, el) => {
    const row = $(el).find("td");
    const code = unifyString(row.eq(0).text().trim());

    const teacherAndTime = spacing(row.eq(9).text());

    const [teachers, times] = splitTeacherAndTime(teacherAndTime);

    results.push({
      code,
      name: spacing(row.eq(1).text()),
      class: spacing(row.eq(2).text()),
      time: spacing(times),
      teacher: spacing(teachers),
    });
  });

  return results;
};

const fetchUnitTeacher = async (
  yms: string,
  unit: string,
  jar: CookieJar,
): Promise<TeacherClasses[]> => {
  const $ = await callApi({ yms, unit, jar });
  const data = $("#tea_str1 option");

  const entries: { code: string; value: string; promise: Promise<CourseItem[]> }[] = [];

  data.each((_, el) => {
    const code = $(el).val() as string;
    const value = $(el).text().trim();

    if (code) {
      entries.push({
        code,
        value,
        promise: fetchTeacherClasses(yms, code, jar),
      });
    }
  });

  const resolved = await Promise.all(
    entries.map(async ({ code, value, promise }) => ({
      code,
      value,
      result: await promise,
    })),
  );

  return resolved.map(({ code, value, result }) => ({
    code,
    name: value,
    class: result,
  }));
};

const fetchTeachers = async (yms: string, jar: CookieJar) => {
  const [year, semester] = yms.split("#");

  const $ = await callApi({ yms, jar });
  const data = $("#unit option");

  const limit = pLimit(10);
  const entries: { code: string; value: string; promise: Promise<TeacherClasses[]> }[] = [];

  data.each((_, el) => {
    const code = $(el).val() as string;
    const value = $(el).text().trim();

    console.log(`[${year} - ${semester}] Fetching unit ${value} (${code})...`);

    if (code) {
      entries.push({
        code,
        value,
        promise: limit(() => fetchUnitTeacher(yms, code, jar)),
      });
    }
  });

  const resolved = await Promise.all(
    entries.map(async ({ code, value, promise }) => ({
      code,
      value,
      result: await promise,
    })),
  );

  const results: Units[] = resolved.map(({ code, value, result }) => ({
    code,
    name: value,
    teachers: result,
  }));

  await writeJson(`./dist/${year}/${semester}/teachers.json`, results, true);
};

const main = async () => {
  const authJar = await login();
  const yearAndSemesters: YearAndSemester[] = await LoadYMS();

  const jobs: Promise<void>[] = [];
  // Find default equals to true, and get the year for the true item
  const defaultItem = yearAndSemesters.find((item) => item.default);

  if (defaultItem) {
    const [year] = defaultItem.code.split("#");

    // Add all results with the same year as the default item
    yearAndSemesters.forEach((item) => {
      const [itemYear] = item.code.split("#");

      if (itemYear === year) {
        jobs.push(fetchTeachers(item.code, authJar));
      } else console.log(`Skip fetching teachers for ${item.code}`);
    });
  }

  // Done job one by one to avoid overwhelming the server
  for (const job of jobs) {
    await job;
  }

  console.log("All done.");
};

// Read first argument from command line
const args = process.argv.slice(2);

// Treat first argument as yms if exists
if (args.length > 0) {
  const yms = args[0];

  (async () => {
    console.log("Fetch teachers for", yms);

    const authJar = await login();

    await fetchTeachers(yms, authJar);

    console.log(`Fetch teachers for ${yms} done.`);
  })();
} else {
  (async () => {
    await main();
  })();
}
