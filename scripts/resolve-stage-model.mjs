import { setOutputs } from "./lib/actions-output.mjs";
import { resolveFactoryStageModelInfo } from "./lib/factory-config.mjs";

const mode = process.env.FACTORY_MODE;
const overrideModel = process.env.FACTORY_STAGE_MODEL_OVERRIDE || "";

const info = resolveFactoryStageModelInfo({
  mode,
  overrideModel
});

setOutputs({
  model: info.model,
  model_source: info.source,
  model_source_variable: info.sourceVariable
});
