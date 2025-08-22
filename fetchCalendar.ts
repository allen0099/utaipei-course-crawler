import { fetcher, fetchSinglePage } from "@/utils/fetcher";
import { writeJson } from "@/utils/dir";
import { spacing } from "@/utils/text";

interface calendarItem {
  year: number;
  semester: number;
  title: string;
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

        const year = parseInt(text.match(/(\d{3})/g)?.[0] || "0");
        const semester = text.includes("上學期") ? 1 : 2;
        const title = spacing(text);
        const fullLink = `https://adeva.utaipei.edu.tw${link}`;

        results.push({ year, semester, title });

        (async () => {
          await fetcher.download(fullLink, `./dist/calendar/${year}/${title}.pdf`);
        })();
      });
  });

  // Sort results by year and semester
  results.sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year; // Sort by year first
    }
    return a.semester - b.semester; // Then by semester
  });

  await writeJson("./dist/calendar.json", results);
};

(async () => {
  await fetchCalendar();
  console.log("Calendar data fetched and saved successfully!");
})();
