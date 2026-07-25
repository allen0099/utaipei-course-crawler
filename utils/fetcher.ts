import fs from "fs";

import { load, CheerioAPI } from "cheerio";
import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";

import { checkPath } from "@/utils/dir";

type GenericFetch<T1, T2, T3> = (input: T1, init?: T2) => Promise<T3>;
const delay = (s: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, s));

export const retryFetcher: GenericFetch<
  string | URL | globalThis.Request,
  RequestInit,
  Response
> = async (input, init = {}): Promise<Response> => {
  let retry = 0;

  while (retry < 10) {
    try {
      const now = new Date();
      const response = await fetch(input, {
        method: init.method ? init.method : "GET",
        ...init,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log(`[fetch] ${input} done. (${new Date().getTime() - now.getTime()}ms)`);

      return response;
    } catch (e: any) {
      console.error(`[error] ${input} - Attempt ${retry + 1}: ${e.message}`);
      retry += 1;
      await delay(1000 * retry * retry);
    }
  }
  throw new Error(`Failed to fetch ${input} after ${retry} attempts.`);
};

export const fetchSinglePage = async (
  url: string,
  options?: RequestInit,
  jar?: CookieJar,
): Promise<CheerioAPI> => {
  await delay(100 + Math.random() * 500);

  let response: Response;

  if (jar) {
    const fetchCookie = makeFetchCookie(retryFetcher, jar);

    response = await fetchCookie(url, options);
  } else response = await retryFetcher(url, options);
  const html = await response.text();

  if (html === null) {
    throw new Error(`Could not find the page, [${options?.method || "GET"}] ${url}`);
  }

  return load(html);
};

export const fetcher = {
  get: (url: string, options?: RequestInit) => {
    return fetchSinglePage(url, { method: "GET", ...options });
  },
  post: (url: string, postedBody: URLSearchParams, options?: RequestInit, jar?: CookieJar) => {
    if (!options?.headers)
      options = { ...options, headers: { "Content-Type": "application/x-www-form-urlencoded" } };

    return fetchSinglePage(url, { method: "POST", body: postedBody, ...options }, jar);
  },
  authPost: (url: string, postedBody: URLSearchParams, jar: CookieJar, options?: RequestInit) => {
    return fetcher.post(url, postedBody, options, jar);
  },
  /** 下載檔案並回傳其內容，供呼叫端在存檔後直接解析，不必再讀一次磁碟。 */
  download: async (url: string, filePath: string): Promise<Uint8Array> => {
    const response = await retryFetcher(url);
    const destination = checkPath(filePath);
    const content = new Uint8Array(await response.arrayBuffer());

    await fs.promises.writeFile(destination, content);

    console.log(`[download] ${url} to ${destination} done.`);

    return content;
  },
};
