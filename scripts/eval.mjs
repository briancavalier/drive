import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvalCorpus } from "./validate-eval-corpus.mjs";
import { parseEvalCliArgs, runEval, DEFAULT_CORPUS_ROOT } from "./lib/eval-runner.mjs";

export function main(argv = process.argv.slice(2), repoRoot = process.cwd()) {
  const options = parseEvalCliArgs(argv);
  validateEvalCorpus(DEFAULT_CORPUS_ROOT, repoRoot);

  const result = runEval({
    repoRoot,
    corpusRoot: DEFAULT_CORPUS_ROOT,
    split: options.split,
    taskIds: options.taskIds,
    output: options.output
  });

  process.stdout.write(
    `Wrote eval results to ${path.relative(repoRoot, result.outputRoot) || result.outputRoot}\n`
  );

  return result;
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main();
}
