import { LABEL_DEFINITIONS } from "./lib/factory-config.mjs";
import { ensureLabels } from "./lib/github.mjs";

await ensureLabels(LABEL_DEFINITIONS);
