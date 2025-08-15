import { load, CheerioAPI } from "cheerio";

const delay = (s: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, s));

async function fetchSinglePage(url: string, options?: RequestInit): Promise<CheerioAPI | null> {
  await delay(100 + Math.random() * 500);
  const html = await getResp(url, options);
  if (html === null) {
    return null;
  }
  return load(html);
}

async function getResp(url: string, options: RequestInit = {}): Promise<string | null> {
  let retry = 0;
  while (retry < 10) {
    try {
      const now = new Date();
      const response = await fetch(url, {
        method: "GET",
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      console.log(`[fetch] ${url} done. (${new Date().getTime() - now.getTime()}ms)`);
      return html;
    } catch (e: any) {
      console.error(`[error] ${url} - Attempt ${retry + 1}: ${e.message}`);
      retry += 1;
      await delay(1000 * retry * retry);
    }
  }
  console.error(`[error] ${url} - Failed after ${retry} attempts.`);
  return null;
}

export default { fetchSinglePage };
