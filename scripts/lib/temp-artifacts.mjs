import fs from "node:fs";
import path from "node:path";

const FACTORY_TMP_PATH = path.join(".factory", "tmp");

export function pruneFactoryTempArtifacts(baseDir = process.cwd()) {
  const absoluteTempPath = path.join(baseDir, FACTORY_TMP_PATH);

  if (!fs.existsSync(absoluteTempPath)) {
    return false;
  }

  fs.rmSync(absoluteTempPath, { recursive: true, force: true });
  fs.mkdirSync(absoluteTempPath, { recursive: true });

  return true;
}
