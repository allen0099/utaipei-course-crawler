import fs from "fs";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { load, CheerioAPI } from "cheerio";
import { checkPath } from "@/utils/dir";

const delay = (s: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, s));

async function retryFetcher(url: string, options: RequestInit = {}): Promise<Response> {
  let retry = 0;
  while (retry < 10) {
    try {
      const now = new Date();
      const response = await fetch(url, {
        method: options.method ? options.method : "GET",
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log(`[fetch] ${url} done. (${new Date().getTime() - now.getTime()}ms)`);
      return response;
    } catch (e: any) {
      console.error(`[error] ${url} - Attempt ${retry + 1}: ${e.message}`);
      retry += 1;
      await delay(1000 * retry * retry);
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retry} attempts.`);
}

export const fetchSinglePage = async (url: string, options?: RequestInit): Promise<CheerioAPI> => {
  await delay(100 + Math.random() * 500);
  const response = await retryFetcher(url, options);
  const html = await response.text();
  if (html === null) {
    throw new Error(`Could not find the page, [${options?.method || "GET"}] ${url}`);
  }
  return load(html);
};

export const fetcher = {
  get: (url: string, options?: RequestInit) => {
    return retryFetcher(url, { method: "GET", ...options });
  },
  post: (url: string, options?: RequestInit) => {
    return retryFetcher(url, { method: "POST", ...options });
  },
  download: async (url: string, filePath: string) => {
    const { body } = await retryFetcher(url);
    const destination = checkPath(filePath);

    const fileStream = fs.createWriteStream(destination);
    await finished(Readable.fromWeb(body as any).pipe(fileStream));

    console.log(`[download] ${url} to ${destination} done.`);
  },
};
