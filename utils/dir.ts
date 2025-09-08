import fs from "fs";
import path from "path";

import { writeFile } from "jsonfile";

export const checkPath = (input: string): string => {
  const dirname = path.dirname(input);

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }

  return input;
};

export const writeJson = async <T>(
  filePath: string,
  data: T,
  compress: boolean = false,
): Promise<void> => {
  const outputPath = checkPath(filePath);

  if (compress) {
    // Write minified JSON
    await writeFile(outputPath, data);
    console.log(`[Write] Compressed data written to ${outputPath}`);

    return;
  }
  await writeFile(outputPath, data, { spaces: 2, EOL: "\r\n" });
  console.log(`[Write] Data written to ${outputPath}`);
};
