import fs from "fs";
import path from "path";

export const checkPath = (input: string): string => {
  const dirname = path.dirname(input);

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }

  return input;
};
