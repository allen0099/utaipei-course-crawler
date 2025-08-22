import { fetcher } from "@/utils/fetcher";
import { writeJson } from "@/utils/dir";
import { spacing } from "@/utils/text";

interface Category {
  code: string;
  name: string;
}

interface PostedItem {
  yms_yms: string;
  dgr_id: string;
  dpt_id: string;
  unt_id: string;
  clyear: string;
  hid_crk: string;
  class_type: string;
  sub_name: string;
  teacher: string;
  uid: string;
  ls_year: string;
  ls_sms: string;
  ls_years: string;
  ls_smss: string;
  data: string;
}

const fetchCategories = async (yms: string) => {
  const [year, semester] = yms.split("#");
  const url = "https://shcourse.utaipei.edu.tw/utaipei/ag_pro/ag203_crk.jsp";

  console.log(`Fetching categories for ${year} semester ${semester}...`);

  const posted: Partial<PostedItem> = {
    yms_yms: yms,
    ls_year: year,
    ls_sms: semester,
  };

  const postedEncoded = new URLSearchParams(posted);

  const $ = await fetcher.post(url, postedEncoded);
  const data = $("#sel_crk option");

  const categories: Category[] = [];

  data.each((_, el) => {
    // Get each option's value and text
    const value = $(el).val();
    const text = $(el).text().trim();

    if (value && text) {
      if (Array.isArray(value)) throw new Error("Unexpected array value");
      categories.push({ code: value, name: spacing(text) });
    }
  });

  await writeJson(`./dist/${year}/${semester}/categories.json`, categories);
};

const fetchStandards = async () => {
  const url = "https://shcourse.utaipei.edu.tw/utaipei/ag_pro/ag203.jsp";

  const $ = await fetcher.post(url, new URLSearchParams());
  const data = $("#yms_yms option");

  const ymss: string[] = [];

  data.each((_, el) => {
    const value = $(el).val();

    if (Array.isArray(value)) throw new Error("Unexpected array value");
    if (value) ymss.push(value);
  });

  const jobs: Promise<void>[] = [];
  ymss.forEach((item) => {
    jobs.push(fetchCategories(item));
  });

  await Promise.all(jobs);
  console.log("All categories fetched!");

  await writeJson("./dist/standards.json", ymss);
};

(async () => {
  await fetchStandards();
  console.log("Standards data fetched successfully!");
})();
