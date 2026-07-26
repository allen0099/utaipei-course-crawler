import fs from "fs";

import { CheerioAPI } from "cheerio";
import pLimit from "p-limit";

import {
  ClassCollege,
  ClassCourseItem,
  ClassDepartment,
  ClassItem,
  ClassSchedule,
  YearAndSemester,
} from "@/interfaces/globals";
import { LoadYMS } from "@/utils/common";
import { writeJson } from "@/utils/dir";
import { parseOptions } from "@/utils/dom";
import { fetcher } from "@/utils/fetcher";
import { spacing, splitCourseSchedule, unifyString } from "@/utils/text";

const BASE = "https://shcourse.utaipei.edu.tw/utaipei/ag_pro";

// 系所班級課程查詢 is three POSTs against the same host:
//   ag304_01.jsp -> the form itself; re-posted with dpt_id set it re-renders
//                   unt_id for that college (the page's getShowData()).
//   ag304_02.jsp -> the 班級 list for one 系所, as a 4-column table of
//                   <div onclick="go_next('<班級代碼>')">.
//   ag304_03.jsp -> one class's 排課清單 + 週課表.
// None of them need a session: unlike the ag300/ag302 queries on my.utaipei,
// these answer plain unauthenticated POSTs. `uid` is sent because the form
// sends it, not because it is checked.
const postForm = (
  endpoint: string,
  yms: string,
  dptId?: string,
  untId?: string,
): Promise<CheerioAPI> => {
  const [year, semester] = yms.split("#");

  const body = new URLSearchParams({
    yms_yms: yms,
    ls_year: year,
    ls_sms: semester,
    uid: "guest",
    ls_years: "0",
    ls_smss: "0",
  });

  if (dptId !== undefined) body.set("dpt_id", dptId);
  if (untId !== undefined) body.set("unt_id", untId);

  return fetcher.post(`${BASE}/${endpoint}`, body);
};

const stripMarkers = (input: string): string => unifyString(input).replace(/[【】]/g, "");

/** The 班級 offered by one 系所. Departments with no classes return no table. */
const fetchClassList = async (yms: string, dptId: string, untId: string): Promise<ClassItem[]> => {
  const $ = await postForm("ag304_02.jsp", yms, dptId, untId);

  const classes: ClassItem[] = [];

  $("td div[onclick]").each((_, el) => {
    const code = /go_next\('(\d+)'\)/.exec($(el).attr("onclick") || "")?.[1];
    const name = spacing($(el).text());

    // The table is padded out to four columns, so trailing cells are blank.
    if (code && name) classes.push({ code, name });
  });

  return classes;
};

/** One class's 【班級排課清單】. The page's second table (the weekly grid) is
 *  ignored — the web app derives it from these rows' time strings. */
const fetchClassSchedule = async (yms: string, item: ClassItem): Promise<ClassSchedule> => {
  const [year, semester] = yms.split("#");

  const body = new URLSearchParams({
    arg01: year,
    arg02: semester,
    arg: item.code,
    uid: "guest",
  });

  const $ = await fetcher.post(`${BASE}/ag304_03.jsp`, body);

  // Pick the table by its header rather than by position: a class with no
  // courses at all would otherwise hand us the weekly grid instead.
  const table = $("table")
    .filter((_, el) => $(el).find("tr").first().text().includes("選課代碼"))
    .first();

  const courses: ClassCourseItem[] = [];

  table
    .find("tr")
    .slice(1)
    .each((_, el) => {
      const row = $(el).find("td");

      if (row.length < 12) return;

      const { teachers, times, classrooms } = splitCourseSchedule(row.eq(8).text());

      courses.push({
        code: unifyString(row.eq(0).text()),
        name: spacing(row.eq(1).text()),
        // Same meaning as teachers.json / locations.json `class`: the 班級
        // name, which here is the class being queried.
        class: item.name,
        group: unifyString(row.eq(2).text()),
        credits: unifyString(row.eq(3).text()),
        hours: unifyString(row.eq(4).text()),
        required: stripMarkers(row.eq(5).text()),
        courseType: stripMarkers(row.eq(6).text()),
        campus: spacing(row.eq(7).text()),
        teacher: teachers,
        time: times,
        classroom: classrooms,
        category: spacing(row.eq(9).text()),
        genderLimit: spacing(row.eq(10).text()),
        // 教學綱要's onclick carries the 班級代碼 that actually offers the
        // course, e.g. go_next('114','1','19071411,05430.20').
        hostClass: /'(\d+),/.exec(row.eq(11).attr("onclick") || "")?.[1] || "",
      });
    });

  return { ...item, courses };
};

const fetchClassesForYms = async (yms: string): Promise<void> => {
  const [year, semester] = yms.split("#");
  const tag = `[${year}-${semester}]`;

  // ag304's 系所 lists are NOT the same as ag203's (departments.json): for
  // 114#1, ag304's 理學院 has 12 系所 including 9000 應用物理暨化學系 (which does
  // have classes) while departments.json has 11 and omits it. So the cascade is
  // walked here rather than reusing the published departments.json.
  const $base = await postForm("ag304_01.jsp", yms);
  const collegeList = parseOptions($base, "dpt_id");

  console.log(`${tag} ${collegeList.length} colleges`);

  // Each phase uses its own limiter and completes before the next starts.
  // Nesting one pLimit inside another would starve the inner tasks of slots.
  const collegeLimit = pLimit(5);
  const cascades = await Promise.all(
    collegeList.map((college) =>
      collegeLimit(async () => {
        const $ = await postForm("ag304_01.jsp", yms, college.code);
        const departments = parseOptions($, "unt_id");

        console.log(`${tag} ${college.name} (${college.code}): ${departments.length} departments`);

        return { college, departments };
      }),
    ),
  );

  const listLimit = pLimit(10);
  const withClasses = await Promise.all(
    cascades.flatMap(({ college, departments }) =>
      departments.map((department) =>
        listLimit(async (): Promise<{ collegeCode: string; department: ClassDepartment }> => ({
          collegeCode: college.code,
          department: {
            ...department,
            classes: await fetchClassList(yms, college.code, department.code),
          },
        })),
      ),
    ),
  );

  const colleges: ClassCollege[] = cascades.map(({ college }) => ({
    ...college,
    departments: withClasses
      .filter((entry) => entry.collegeCode === college.code)
      .map((entry) => entry.department),
  }));

  // The index is written before the per-class files so that a run interrupted
  // half way still leaves a readable (if incomplete) directory. It is also the
  // marker outputExists() checks, so it is rewritten last on a re-run below.
  await writeJson(`./dist/${year}/${semester}/classes.json`, colleges, true);

  // The same class can be listed under more than one 系所; fetch it once.
  const uniqueClasses = new Map<string, ClassItem>(
    colleges
      .flatMap((college) => college.departments)
      .flatMap((department) => department.classes)
      .map((item) => [item.code, item]),
  );

  console.log(`${tag} ${uniqueClasses.size} classes to fetch`);

  const scheduleLimit = pLimit(10);
  let done = 0;

  await Promise.all(
    [...uniqueClasses.values()].map((item) =>
      scheduleLimit(async () => {
        const schedule = await fetchClassSchedule(yms, item);

        await writeJson(`./dist/${year}/${semester}/classes/${item.code}.json`, schedule, true);

        done += 1;
        console.log(
          `${tag} (${done}/${uniqueClasses.size}) ${item.name} (${item.code}): ${schedule.courses.length} courses`,
        );
      }),
    ),
  );
};

const outputExists = (yms: string): boolean => {
  const [year, semester] = yms.split("#");

  return fs.existsSync(`./dist/${year}/${semester}/classes.json`);
};

const main = async () => {
  const yearAndSemesters: YearAndSemester[] = await LoadYMS();
  const defaultItem = yearAndSemesters.find((item) => item.default);
  const defaultYear = defaultItem ? defaultItem.code.split("#")[0] : null;

  // The current 學年度 is always refreshed — its courses are still being edited.
  for (const item of yearAndSemesters) {
    if (item.code.split("#")[0] === defaultYear) {
      await fetchClassesForYms(item.code);
    }
  }

  // Then top up the archive by exactly one 學年期 per run, newest first. A full
  // backfill would be ~24000 requests in one go; this keeps every run to a
  // similar, polite size and still converges.
  const backfill = [...yearAndSemesters]
    .reverse()
    .find((item) => item.code.split("#")[0] !== defaultYear && !outputExists(item.code));

  if (backfill) {
    console.log(`Backfilling ${backfill.code}...`);
    await fetchClassesForYms(backfill.code);
  } else {
    console.log("Nothing left to backfill.");
  }

  console.log("All classes fetched!");
};

// Optionally crawl a single year/semester passed on the command line.
const args = process.argv.slice(2);

if (args.length > 0) {
  const yms = args[0];

  (async () => {
    console.log("Fetch classes for", yms);

    await fetchClassesForYms(yms);

    console.log(`Fetch classes for ${yms} done.`);
  })();
} else {
  (async () => {
    await main();
  })();
}
