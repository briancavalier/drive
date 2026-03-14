import fs from "node:fs";

export function setOutputs(outputs) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  let payload = "";

  for (const [key, value] of Object.entries(outputs)) {
    payload += `${key}<<__EOF__\n${value ?? ""}\n__EOF__\n`;
  }

  fs.appendFileSync(outputPath, payload);
}
