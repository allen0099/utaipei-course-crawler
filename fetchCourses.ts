import fs from "fs";

import { CheerioAPI } from "cheerio";
import pLimit from "p-limit";

import {
  ClassCollege,
  ClassDepartment,
  ClassItem,
  Course,
  YearAndSemester,
} from "@/interfaces/globals";
import { LoadYMS } from "@/utils/common";
import { writeJson } from "@/utils/dir";
import { parseOptions } from "@/utils/dom";
import { fetcher } from "@/utils/fetcher";
import { spacing, splitCourseSchedule, unifyString } from "@/utils/text";

const BASE = "https://shcourse.utaipei.edu.tw/utaipei/ag_pro";

// Two independent queries on the same host, neither of which needs a login:
//
//   ag304 系所班級課程查詢 — 學院→系所→班級→該班排課。Widest coverage
//     (114#1: 3514 courses) and the only source of 分組/領域類/限制性別, so it
//     is the base. Also the only place that says which class *takes* a course.
//   ag203 科目與教師開課班級查詢 — 學院→系所→該系所開的課. A strict subset of
//     ag304's coverage (114#1: 2474, all of them already in ag304), but adds
//     英文課名/人數/合班/備註. Pure enrichment.
//
// ag203_1 rejects unt_id=% or dpt_id=% with 「您所篩選的條件過大」 even with a
// subject keyword, so it has to be one 系所 per request; dgr_id=% is accepted
// and returns every 學制 of that 系所 in one go.
const formBody = (yms: string, extra: Record<string, string> = {}) => {
  const [year, semester] = yms.split("#");

  return new URLSearchParams({
    yms_yms: yms,
    ls_year: year,
    ls_sms: semester,
    uid: "guest",
    ls_years: "0",
    ls_smss: "0",
    ...extra,
  });
};

const stripMarkers = (input: string): string =>
  unifyString(input)
    .replace(/[【】]/g, "")
    .trim();

/** Locate a result table by a word in its header row rather than by position. */
const tableWithHeader = ($: CheerioAPI, header: string) =>
  $("table")
    .filter((_, el) => $(el).find("tr").first().text().includes(header))
    .first();

/** "19071411,05430.20" -> class 19071411, group 20 */
const parseSyllabusKey = (key: string) => ({
  classCode: key.split(",")[0] ?? "",
  group: key.split(".")[1] ?? "",
});

// ---------------------------------------------------------------- ag304 ----

const fetchClassList = async (yms: string, dptId: string, untId: string): Promise<ClassItem[]> => {
  const $ = await fetcher.post(
    `${BASE}/ag304_02.jsp`,
    formBody(yms, { dpt_id: dptId, unt_id: untId }),
  );

  const classes: ClassItem[] = [];

  $("td div[onclick]").each((_, el) => {
    const code = /go_next\('(\d+)'\)/.exec($(el).attr("onclick") || "")?.[1];
    const name = spacing($(el).text());

    // The table is padded out to four columns, so trailing cells are blank.
    if (code && name) classes.push({ code, name });
  });

  return classes;
};

/** One class's 【班級排課清單】; the page's weekly grid is derived, not scraped. */
const fetchClassCourses = async (yms: string, item: ClassItem): Promise<Course[]> => {
  const [year, semester] = yms.split("#");
  const $ = await fetcher.post(
    `${BASE}/ag304_03.jsp`,
    new URLSearchParams({ arg01: year, arg02: semester, arg: item.code, uid: "guest" }),
  );

  const courses: Course[] = [];

  tableWithHeader($, "選課代碼")
    .find("tr")
    .slice(1)
    .each((_, el) => {
      const row = $(el).find("td");

      if (row.length < 12) return;

      const { teachers, times, classrooms } = splitCourseSchedule(row.eq(8).text());
      const syllabusKey = /'(\d+,[\d.]+)'/.exec(row.eq(11).attr("onclick") || "")?.[1] || "";

      courses.push({
        code: unifyString(row.eq(0).text()),
        name: spacing(row.eq(1).text()),
        // Resolved later from the class index: the row says which class *takes*
        // the course, but `class` must name the class that *offers* it.
        class: "",
        classCode: parseSyllabusKey(syllabusKey).classCode,
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
        syllabusKey,
        departmentCodes: [],
        departments: [],
      });
    });

  return courses;
};

// ---------------------------------------------------------------- ag203 ----

/** The 人數 cell is "上限 / 下限 / 已選"; 已選 is deliberately discarded. */
const parseCapacity = (cell: string): Course["capacity"] => {
  const [max, min] = unifyString(cell)
    .split("/")
    .map((part) => part.trim());

  return max || min ? { max: max || "", min: min || "" } : undefined;
};

const fetchDepartmentCourses = async (
  yms: string,
  dptId: string,
  untId: string,
): Promise<Course[]> => {
  const $ = await fetcher.post(
    `${BASE}/ag203_1.jsp`,
    formBody(yms, {
      dgr_id: "%",
      dpt_id: dptId,
      unt_id: untId,
      clyear: "%",
      hid_crk: "%",
      class_type: "%",
      sub_name: "",
      teacher: "",
    }),
  );

  const courses: Course[] = [];

  tableWithHeader($, "選課代號")
    .find("tr")
    .slice(1)
    .each((_, el) => {
      const row = $(el).find("td");

      if (row.length < 15) return;

      const { teachers, times, classrooms } = splitCourseSchedule(row.eq(11).text());
      const syllabusKey = /'(\d+,[\d.]+)'/.exec(row.eq(13).attr("onclick") || "")?.[1] || "";
      const { classCode, group } = parseSyllabusKey(syllabusKey);
      const note = spacing(row.eq(14).text());
      const mixedClass = spacing(row.eq(12).text());
      const nameEn = spacing(row.eq(4).text());
      // 備註欄除了文字，還可能有一顆「相關限修資料」按鈕（擋修條件）。它是
      // <input value="...">，.text() 讀不到，得看 value。
      const hasRestriction = row.eq(14).find('input[value="相關限修資料"]').length > 0;

      courses.push({
        code: unifyString(row.eq(1).text()),
        name: spacing(row.eq(3).text()),
        class: spacing(row.eq(0).text()),
        classCode,
        // ag203_1 has no 分組 column, but the syllabus key ends with it.
        group,
        credits: unifyString(row.eq(5).text()),
        hours: unifyString(row.eq(8).text()),
        required: stripMarkers(row.eq(7).text()),
        courseType: stripMarkers(row.eq(6).text()),
        campus: spacing(row.eq(10).text()),
        teacher: teachers,
        time: times,
        classroom: classrooms,
        category: spacing(row.eq(2).text()),
        // ag203_1 has no 限制性別 column; ag304 fills it in when it has the course.
        genderLimit: "",
        syllabusKey,
        departmentCodes: [],
        departments: [],
        ...(nameEn ? { nameEn } : {}),
        ...(mixedClass ? { mixedClass } : {}),
        ...(note ? { note } : {}),
        ...(hasRestriction ? { hasRestriction } : {}),
        capacity: parseCapacity(row.eq(9).text()),
      });
    });

  return courses;
};

// ------------------------------------------------------------- assembly ----

const addDepartment = (course: Course, code: string, name: string) => {
  if (code && !course.departmentCodes.includes(code)) {
    course.departmentCodes.push(code);
    course.departments.push(name);
  }
};

const fetchCoursesForYms = async (yms: string): Promise<void> => {
  const [year, semester] = yms.split("#");
  const tag = `[${year}-${semester}]`;

  // --- Phase 1: ag304 cascade -> class index -------------------------------
  //
  // Each phase uses its own limiter and completes before the next starts.
  // Nesting one pLimit inside another would starve the inner tasks of slots.
  const collegeList = parseOptions(
    await fetcher.post(`${BASE}/ag304_01.jsp`, formBody(yms)),
    "dpt_id",
  );

  console.log(`${tag} ag304: ${collegeList.length} colleges`);

  const collegeLimit = pLimit(5);
  const cascades = await Promise.all(
    collegeList.map((college) =>
      collegeLimit(async () => ({
        college,
        departments: parseOptions(
          await fetcher.post(`${BASE}/ag304_01.jsp`, formBody(yms, { dpt_id: college.code })),
          "unt_id",
        ),
      })),
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

  await writeJson(`./dist/${year}/${semester}/classes.json`, colleges, true);

  // classCode -> class name, so a course can be labelled with the class that
  // offers it rather than whichever class's timetable we happened to find it in.
  const classNames = new Map<string, string>();
  // unt_id of the department each class belongs to, for departmentCodes.
  const classDepartment = new Map<string, { code: string; name: string }>();

  colleges.forEach((college) =>
    college.departments.forEach((department) =>
      department.classes.forEach((item) => {
        classNames.set(item.code, item.name);
        classDepartment.set(item.code, { code: department.code, name: department.name });
      }),
    ),
  );

  const uniqueClasses = new Map<string, ClassItem>(
    colleges
      .flatMap((college) => college.departments)
      .flatMap((department) => department.classes)
      .map((item) => [item.code, item]),
  );

  console.log(`${tag} ag304: ${uniqueClasses.size} classes`);

  // --- Phase 2: ag304 per-class course lists -> courses base ---------------
  const courses = new Map<string, Course>();
  const scheduleLimit = pLimit(10);
  let done = 0;

  await Promise.all(
    [...uniqueClasses.values()].map((item) =>
      scheduleLimit(async () => {
        const rows = await fetchClassCourses(yms, item);
        const department = classDepartment.get(item.code);

        rows.forEach((row) => {
          const existing = courses.get(row.code);
          const course = existing ?? row;

          if (!existing) courses.set(row.code, row);
          // The course appears in this class's timetable, so this class's
          // department is one of the departments interested in it.
          if (department) addDepartment(course, department.code, department.name);
        });

        await writeJson(
          `./dist/${year}/${semester}/classes/${item.code}.json`,
          { ...item, courseCodes: rows.map((row) => row.code) },
          true,
        );

        done += 1;
        console.log(`${tag} ag304 (${done}/${uniqueClasses.size}) ${item.name}: ${rows.length}`);
      }),
    ),
  );

  const ag304Count = courses.size;

  // --- Phase 3: ag203 cascade -> enrichment --------------------------------
  const ag203Colleges = parseOptions(
    await fetcher.post(`${BASE}/ag203.jsp`, formBody(yms)),
    "dpt_id",
  );

  const ag203Cascade = await Promise.all(
    ag203Colleges.map((college) =>
      collegeLimit(async () => ({
        college,
        departments: parseOptions(
          await fetcher.post(`${BASE}/ag203.jsp`, formBody(yms, { dpt_id: college.code })),
          "unt_id",
        ),
      })),
    ),
  );

  const ag203Pairs = ag203Cascade.flatMap(({ college, departments }) =>
    departments.map((department) => ({ college, department })),
  );

  console.log(`${tag} ag203: ${ag203Pairs.length} departments`);

  const enrichLimit = pLimit(10);
  let enriched = 0;
  let added = 0;

  await Promise.all(
    ag203Pairs.map(({ college, department }) =>
      enrichLimit(async () => {
        const rows = await fetchDepartmentCourses(yms, college.code, department.code);

        rows.forEach((row) => {
          const existing = courses.get(row.code);

          if (!existing) {
            courses.set(row.code, row);
            addDepartment(row, department.code, department.name);
            added += 1;

            return;
          }

          // ag304 wins on the fields both have (it also has 分組 and 限制性別);
          // ag203 only contributes what ag304 cannot see.
          if (row.nameEn) existing.nameEn = row.nameEn;
          if (row.capacity) existing.capacity = row.capacity;
          if (row.mixedClass) existing.mixedClass = row.mixedClass;
          if (row.note) existing.note = row.note;
          if (row.hasRestriction) existing.hasRestriction = true;
          if (!existing.class && row.class) existing.class = row.class;
          addDepartment(existing, department.code, department.name);
          enriched += 1;
        });
      }),
    ),
  );

  // --- Phase 4: resolve offering-class names, write, report ----------------
  courses.forEach((course) => {
    if (!course.class) course.class = classNames.get(course.classCode) ?? "";
  });

  const all = [...courses.values()];

  await writeJson(`./dist/${year}/${semester}/courses.json`, all, true);

  const withCapacity = all.filter((course) => course.capacity).length;
  const withNote = all.filter((course) => course.note).length;
  const withRestriction = all.filter((course) => course.hasRestriction).length;
  const withoutClass = all.filter((course) => !course.class).length;

  console.log(
    [
      `${tag} courses.json: ${all.length} courses`,
      `  ag304 base ${ag304Count}, ag203 enriched ${enriched}, ag203-only added ${added}`,
      `  with capacity ${withCapacity} (${Math.round((withCapacity / all.length) * 100)}%)`,
      `  with note ${withNote}, with restriction ${withRestriction}`,
      `  offering class unresolved ${withoutClass}`,
    ].join("\n"),
  );
};

const outputExists = (yms: string): boolean => {
  const [year, semester] = yms.split("#");

  return fs.existsSync(`./dist/${year}/${semester}/courses.json`);
};

const main = async () => {
  const yearAndSemesters: YearAndSemester[] = await LoadYMS();
  const defaultItem = yearAndSemesters.find((item) => item.default);
  const defaultYear = defaultItem ? defaultItem.code.split("#")[0] : null;

  // The current 學年度 is always refreshed — its courses are still being edited.
  for (const item of yearAndSemesters) {
    if (item.code.split("#")[0] === defaultYear) {
      await fetchCoursesForYms(item.code);
    }
  }

  // Then top up the archive by exactly one 學年期 per run, newest first, so no
  // single run has to carry a full backfill.
  const backfill = [...yearAndSemesters]
    .reverse()
    .find((item) => item.code.split("#")[0] !== defaultYear && !outputExists(item.code));

  if (backfill) {
    console.log(`Backfilling ${backfill.code}...`);
    await fetchCoursesForYms(backfill.code);
  } else {
    console.log("Nothing left to backfill.");
  }

  console.log("All courses fetched!");
};

// Optionally crawl a single year/semester passed on the command line.
const args = process.argv.slice(2);

if (args.length > 0) {
  const yms = args[0];

  (async () => {
    console.log("Fetch courses for", yms);

    await fetchCoursesForYms(yms);

    console.log(`Fetch courses for ${yms} done.`);
  })();
} else {
  (async () => {
    await main();
  })();
}
