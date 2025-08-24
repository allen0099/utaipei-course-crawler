import makeFetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { retryFetcher } from "@/utils/fetcher";

export const login = async () => {
  const jar = new CookieJar();
  const fetchCookie = makeFetchCookie(retryFetcher, jar);

  const preLoginUrl = "https://my.utaipei.edu.tw/utaipei/login_check.jsp";
  const preCheckUrl = "https://my.utaipei.edu.tw/utaipei/perchk.jsp";

  const defaultHeader = new Headers();
  defaultHeader.append("Content-Type", "application/x-www-form-urlencoded");

  const preLoginParams = new URLSearchParams();
  preLoginParams.append("uid", "guest");
  preLoginParams.append("pwd", "123");
  preLoginParams.append("myway", "yes");
  preLoginParams.append("check_choice", "");
  preLoginParams.append("teach_roll", "");
  preLoginParams.append("std_dorm", "");
  preLoginParams.append("std_vote", "");
  preLoginParams.append("std_choice", "");

  const preCheckParams = new URLSearchParams();
  preCheckParams.append("uid", "guest");
  preCheckParams.append("check_choice", "");
  preCheckParams.append("teach_roll", "");
  preCheckParams.append("dorm_room", "");
  preCheckParams.append("std_vote", "");
  preCheckParams.append("std_choice", "");
  preCheckParams.append("err", "N");
  preCheckParams.append("hid_type", "X");

  await fetchCookie(preLoginUrl, {
    method: "POST",
    headers: defaultHeader,
    body: preLoginParams,
  }).catch((error) => console.error(error));

  await fetchCookie(preCheckUrl, {
    method: "POST",
    headers: defaultHeader,
    body: preCheckParams,
  }).catch((error) => console.error(error));

  return jar;
};
