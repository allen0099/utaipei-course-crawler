import fs from "fs";

import { CheerioAPI } from "cheerio";
import pLimit from "p-limit";

import { YearAndSemester } from "@/interfaces/globals";
import { LoadYMS } from "@/utils/common";
import { writeJson } from "@/utils/dir";
import { fetcher } from "@/utils/fetcher";
import { spacing } from "@/utils/text";

interface Item {
  code: string;
  name: string;
}

interface College extends Item {
  departments: Item[];
}

const BASE = "https://shcourse.utaipei.edu.tw/utaipei/ag_pro/ag203.jsp";

// The ag203 course-query form exposes the cascade as three <select>s:
//   dgr_id -> 學制 (Level)   — fixed list, independent of the others
//   dpt_id -> 學院 (College) — varies per year/semester
//   unt_id -> 科系 (Department) — depends on the selected college
// Selecting a college re-POSTs the whole form to ag203.jsp with dpt_id set,
// which re-renders unt_id for that college (see the page's getShowData()).
const postForm = (yms: string, dptId?: string): Promise<CheerioAPI> => {
  const [year, semester] = yms.split("#");
  const body = new URLSearchParams({
    yms_yms: yms,
    ls_year: year,
    ls_sms: semester,
  });

  if (dptId !== undefined) body.set("dpt_id", dptId);

  return fetcher.post(BASE, body);
};

// Read a <select>'s <option>s, dropping the "請選擇" (empty value) and
// "所有…" (value "%") aggregate entries.
const parseOptions = ($: CheerioAPI, id: string): Item[] => {
  const items: Item[] = [];

  $(`#${id} option`).each((_, el) => {
    const value = $(el).val();
    const text = $(el).text().trim();

    if (Array.isArray(value)) throw new Error("Unexpected array value");
    if (!value || value === "%" || !text) return;

    items.push({ code: value, name: spacing(text) });
  });

  return items;
};

interface DepartmentsResult {
  levels: Item[];
  colleges: College[];
}

const fetchDepartmentsForYms = async (yms: string): Promise<DepartmentsResult> => {
  const [year, semester] = yms.split("#");

  const $base = await postForm(yms);
  const levels = parseOptions($base, "dgr_id");
  const collegeList = parseOptions($base, "dpt_id");

  // Fetch each college's departments (unt_id) concurrently, but capped so we
  // don't overwhelm the school server.
  const limit = pLimit(10);
  const colleges: College[] = await Promise.all(
    collegeList.map((college) =>
      limit(async () => {
        const $ = await postForm(yms, college.code);

        console.log(`[${year}-${semester}] College ${college.name} (${college.code})`);

        return { ...college, departments: parseOptions($, "unt_id") };
      }),
    ),
  );

  await writeJson(`./dist/${year}/${semester}/departments.json`, colleges);

  return { levels, colleges };
};

const outputExists = (yms: string): boolean => {
  const [year, semester] = yms.split("#");

  return fs.existsSync(`./dist/${year}/${semester}/departments.json`);
};

const main = async () => {
  const yearAndSemesters: YearAndSemester[] = await LoadYMS();
  const defaultItem = yearAndSemesters.find((item) => item.default);
  const defaultYear = defaultItem ? defaultItem.code.split("#")[0] : null;

  let levels: Item[] = [];

  // Process one year/semester at a time to keep the request rate polite.
  for (const item of yearAndSemesters) {
    const [year] = item.code.split("#");
    const isDefaultYear = year === defaultYear;

    // The default year is always refreshed; every other year is only crawled
    // once (backfill) and skipped thereafter if its output already exists.
    if (!isDefaultYear && outputExists(item.code)) {
      console.log(`Skip departments for ${item.code} (already exists)`);
      continue;
    }

    const result = await fetchDepartmentsForYms(item.code);

    if (result.levels.length > 0) levels = result.levels;
  }

  // 學制 (Level) is fixed across years, so it lives at the dist root rather
  // than under a specific year/semester.
  if (levels.length > 0) {
    await writeJson("./dist/levels.json", levels);
  }

  console.log("All departments fetched!");
};

// Optionally crawl a single year/semester passed on the command line.
const args = process.argv.slice(2);

if (args.length > 0) {
  const yms = args[0];

  (async () => {
    console.log("Fetch departments for", yms);

    const { levels } = await fetchDepartmentsForYms(yms);

    if (levels.length > 0) await writeJson("./dist/levels.json", levels);

    console.log(`Fetch departments for ${yms} done.`);
  })();
} else {
  (async () => {
    await main();
  })();
}
