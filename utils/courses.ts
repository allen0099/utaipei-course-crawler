import fs from "fs";

import { Course, PartialCourse } from "@/interfaces/globals";

/**
 * The 選課代碼 already published in courses.json for this 學年期.
 *
 * Empty when fetchCourses has not run for it yet — in which case every course
 * the caller saw counts as "extra", which is the safe direction: the data is
 * still published, just without the fields only courses.json carries.
 */
export const loadPublishedCourseCodes = (yms: string): Set<string> => {
  const [year, semester] = yms.split("#");
  const file = `./dist/${year}/${semester}/courses.json`;

  if (!fs.existsSync(file)) {
    console.log(`[courses] ${file} not found; treating every course as extra.`);

    return new Set();
  }

  const courses = JSON.parse(fs.readFileSync(file, "utf-8")) as Course[];

  return new Set(courses.map((course) => course.code));
};

/**
 * Keep one entry per 選課代碼 for the courses courses.json does not have, so an
 * index file carries each of its orphans exactly once rather than once per
 * teacher or per room.
 */
export const collectExtraCourses = (
  seen: Set<string>,
  courses: PartialCourse[],
): PartialCourse[] => {
  const extras = new Map<string, PartialCourse>();

  courses.forEach((course) => {
    if (!course.code || seen.has(course.code) || extras.has(course.code)) return;
    extras.set(course.code, course);
  });

  return [...extras.values()];
};
