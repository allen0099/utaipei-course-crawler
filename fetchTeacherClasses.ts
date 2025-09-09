import { CheerioAPI } from "cheerio";
import pLimit from "p-limit";
import { CookieJar } from "tough-cookie";

import { CourseItem, YearAndSemester } from "@/interfaces/globals";
import { login } from "@/utils/authFetcher";
import { LoadYMS } from "@/utils/common";
import { writeJson } from "@/utils/dir";
import { fetcher } from "@/utils/fetcher";
import { spacing, unifyString } from "@/utils/text";

interface Courses {
  code: string;
}

interface TeacherClasses {
  code: string;
  name: string;
  class: Courses[];
}

interface Units {
  code: string;
  name: string;
  teachers: TeacherClasses[];
}

interface AwaitedResolved<T extends (...args: any) => Promise<any>> {
  value: string;
  result: Awaited<ReturnType<T>>;
}

interface PromiseResults<T extends (...args: any) => Promise<any>> {
  value: string;
  promise: ReturnType<T>;
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

/**
 * Split teacher and time from input string
 * @param input
 * @returns [teacher, time]
 * @example
 * "王小明 (一) 1-2 (教室未定)" => ["王小明", "(一) 1-2"]
 * "王小明時間未定 (教室未定)" => ["王小明", ""]
 * "王小明 (一) 1-2 (教室A) 李小華 (三) 3-4 (教室B)" => ["王小明,李小華", "(一) 1-2 (三) 3-4"]
 */
const splitTeacherAndTime = (input: string): [string, string] => {
  const cleanedInput = spacing(input)
    .replaceAll("(單週)", "")
    .replaceAll("(雙週)", "")
    .replaceAll("\n", ""); // Clean up the input, remove extra spaces

  const teachers: string[] = [];
  const times: string[] = [];

  const timeRegex = /\([一二三四五六日]\)\s*\d+(-\d+)?/g; // Regex to match time patterns like (一) 1-2
  const teacherRegex = /([^\s()]+)(?=\s*\([一二三四五六日]\))/g; // Regex to match teacher names before time patterns

  const timeUndefinedRegex = /([^\s()]+)\s*時間未定/g; // Regex to match teacher names with "時間未定"
  const locationUndefinedRegex = /([^\s()]+)\s*\(教室未定\)/g; // Regex to match teacher names with "(教室未定)"

  let match: RegExpExecArray | null;

  // Extract times
  while ((match = timeRegex.exec(cleanedInput)) !== null) {
    times.push(match[0].trim());
  }

  // Extract teachers with defined times
  while ((match = teacherRegex.exec(cleanedInput)) !== null) {
    teachers.push(match[1].trim());
  }

  // Extract teachers with "時間未定"
  while ((match = timeUndefinedRegex.exec(cleanedInput)) !== null) {
    teachers.push(match[1].trim());
  }

  // Extract teachers with "(教室未定)"
  while ((match = locationUndefinedRegex.exec(cleanedInput)) !== null) {
    const tmpTeacher = match[1].trim();

    if (tmpTeacher.endsWith("時間未定")) continue; // Skip if already added
    teachers.push();
  }

  // Remove duplicates
  const uniqueTeachers = Array.from(new Set(teachers));
  const uniqueTimes = Array.from(new Set(times));

  return [uniqueTeachers.join(","), uniqueTimes.join(" ")];
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

  const results: TeacherClasses[] = [];
  const dataMap: Record<string, PromiseResults<typeof fetchTeacherClasses>> = {};

  data.each((_, el) => {
    const code = $(el).val() as string;
    const value = $(el).text().trim();

    if (code) {
      dataMap[code] = {
        value,
        promise: fetchTeacherClasses(yms, code, jar),
      };
    }
  });

  const resolvedMap: Record<string, AwaitedResolved<typeof fetchTeacherClasses>> = {};

  await Promise.all(
    Object.entries(dataMap).map(async ([code, { value, promise }]) => {
      resolvedMap[code] = { value, result: await promise };
    }),
  );

  for (const [code, { value, result }] of Object.entries(resolvedMap)) {
    results.push({
      code,
      name: value,
      class: result,
    });
  }

  return results;
};

const fetchTeachers = async (yms: string, jar: CookieJar) => {
  const [year, semester] = yms.split("#");
  const results: Units[] = [];

  const $ = await callApi({ yms, jar });
  const data = $("#unit option");

  // Create a map to code and Promise
  const dataMap: Record<string, PromiseResults<typeof fetchUnitTeacher>> = {};

  data.each((_, el) => {
    const code = $(el).val() as string;
    const value = $(el).text().trim();

    console.log(`[${year} - ${semester}] Fetching unit ${value} (${code})...`);

    if (code) {
      dataMap[code] = {
        value,
        promise: undefined as any,
      };
    }
  });

  const resolvedMap: Record<string, AwaitedResolved<typeof fetchUnitTeacher>> = {};

  const limit = pLimit(10);

  const entries = Object.entries(dataMap).map(([code, { value }]) => {
    return {
      code,
      value,
      promise: limit(() => fetchUnitTeacher(yms, code, jar)),
    };
  });

  await Promise.all(
    entries.map(async ({ code, value, promise }) => {
      resolvedMap[code] = { value, result: await promise };
    }),
  );

  for (const [code, { value, result }] of Object.entries(resolvedMap)) {
    results.push({
      code,
      name: value,
      teachers: result,
    });
  }

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
