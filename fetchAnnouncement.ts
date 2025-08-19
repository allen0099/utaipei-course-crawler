import { fetchSinglePage } from "@/utils/fetcher";
import { spacing } from "@/utils/text";
import { writeFile } from "jsonfile";
import { validatePath } from "@/utils/dir";

const reLevel1 = /^[一二三四五六七八九十]+、/;
const reLevel2 = /^\([一二三四五六七八九十]+\)/;
const reLink = /https?:\/\/\S+/;

const outputPath = validatePath("./dist/announcement.json");

interface jsonItem {
  text: string;
  href?: {
    link: string;
    text: string;
  }[];
  level: number;
}

const initialBuffer: jsonItem = {
  text: "",
  href: [],
  level: 2,
};

const fetchAnnouncement = async () => {
  const url = "https://my.utaipei.edu.tw/utaipei/index_main.html?123=";

  const $ = await fetchSinglePage(url);
  const font = $("#std_payment font");

  console.log("Successfully fetched the page!");

  let results: jsonItem[] = [];

  let buffer: jsonItem = { ...initialBuffer, href: [] };

  font.contents().each((_, element) => {
    if (element.type === "comment") return;

    if (element.type === "tag" && element.name === "br") {
      const containLink = buffer.text.match(reLink);
      if (containLink) {
        buffer.href?.push({
          link: containLink[0],
          text: containLink[0],
        });
      }

      // Determine the level of the item
      if (buffer.text.match(reLevel1) || buffer.text.startsWith("【")) {
        buffer.level = 1;
      } else if (buffer.text.match(reLevel2)) {
        buffer.level = 3;
      }

      results.push(buffer);

      buffer = { ...initialBuffer, href: [] }; // Reset buffer for the next item
      return;
    }

    const currentText = spacing($(element).text());

    if (currentText === "") return;

    buffer.text += currentText;

    if (element.type === "text") return;
    if (element.type === "tag" && element.name === "a") {
      const href = $(element).attr("href");

      if (href !== undefined && href.startsWith("http")) {
        buffer.href?.push({
          link: href,
          text: currentText,
        });
      }
    }
  });

  await writeFile(outputPath, results, { spaces: 2, EOL: "\r\n" });
};

(async () => {
  await fetchAnnouncement();
  console.log(`Announcement data has been fetched and saved to ${outputPath}`);
})();
