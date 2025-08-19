import { fetchSinglePage } from "@/utils/fetcher";
import { writeFile } from "jsonfile";
import { validatePath } from "@/utils/dir";

const outputPath = validatePath("./dist/calendar.json");

interface calendarItem {
  year: number;
  semester: number;
  title: string;
  link: string;
}

const fetchCalendar = async () => {
  const setUrl = "https://adeva.utaipei.edu.tw/p/412-1061-73.php";

  const $ = await fetchSinglePage(setUrl);
  const data = $("#Dyn_2_2 > div > div > section > div > div > div > p");

  let results: calendarItem[] = [];

  data.each((_, el) => {
    $(el)
      .find("a")
      .each((_, element) => {
        const text = $(element).text().trim(); // 本校114學年度下學期行事曆
        const link = $(element).attr("href"); // /var/file/61/1061/img/673214137.pdf

        if (!link) return; // Skip if no link is found

        results.push({
          year: parseInt(text.match(/(\d{3})/g)?.[0] || "0"),
          semester: text.includes("上學期") ? 1 : 2,
          title: text,
          link: `https://adeva.utaipei.edu.tw${link}`,
        });
      });
  });

  // Sort results by year and semester
  results.sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year; // Sort by year first
    }
    return a.semester - b.semester; // Then by semester
  });

  await writeFile(outputPath, results, { spaces: 2, EOL: "\r\n" });
};

(async () => {
  await fetchCalendar();
  console.log("Calendar data fetched and saved successfully!");
})();
