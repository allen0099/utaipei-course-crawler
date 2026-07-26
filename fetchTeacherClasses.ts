import { CheerioAPI } from "cheerio";
import pLimit from "p-limit";
import { CookieJar } from "tough-cookie";

import { CourseIndex, PartialCourse, TeacherUnit } from "@/interfaces/globals";
import { login } from "@/utils/authFetcher";
import { resolveTargets } from "@/utils/common";
import { collectExtraCourses, loadPublishedCourseCodes } from "@/utils/courses";
import { writeJson } from "@/utils/dir";
import { fetcher } from "@/utils/fetcher";
import { spacing, splitTeacherAndTime, unifyString } from "@/utils/text";

// Intermediate shapes: the crawl still pulls whole course rows, because that is
// what tells us which ones courses.json is missing. They are reduced to
// TeacherUnit/TeacherEntry (code lists) just before writing.
interface TeacherClasses {
  code: string;
  name: string;
  class: PartialCourse[];
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

  const results: PartialCourse[] = [];

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

  const entries: { code: string; value: string; promise: Promise<PartialCourse[]> }[] = [];

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

  // Publish the index (系級 -> 教師 -> 選課代碼) plus only those courses
  // courses.json does not already carry; everything else is looked up there so
  // a course's fields never differ depending on which file the page read.
  const published = loadPublishedCourseCodes(yms);
  const extraCourses = collectExtraCourses(
    published,
    results.flatMap((unit) => unit.teachers.flatMap((teacher) => teacher.class)),
  );

  const index: CourseIndex<TeacherUnit> = {
    entries: results.map((unit) => ({
      code: unit.code,
      name: unit.name,
      teachers: unit.teachers.map((teacher) => ({
        code: teacher.code,
        name: teacher.name,
        courseCodes: [...new Set(teacher.class.map((course) => course.code))],
      })),
    })),
    extraCourses,
  };

  console.log(
    `[${year}-${semester}] teachers: ${index.entries.length} units, ` +
      `${extraCourses.length} courses not in courses.json`,
  );

  await writeJson(`./dist/${year}/${semester}/teachers.json`, index, true);
};

// `114#1` 只爬那個學年期、`114` 爬整個學年度、省略則爬目前學年度。
const target = process.argv.slice(2)[0]?.trim();

(async () => {
  const targets = await resolveTargets(target);
  const authJar = await login();

  // 一個接一個，不要並行整個學年度 —— 每個學年期本身已經有上千個請求。
  for (const yms of targets) {
    console.log(`Fetch teachers for ${yms}...`);
    await fetchTeachers(yms, authJar);
  }

  console.log(`All teachers fetched (${targets.length} 學年期).`);
})();
