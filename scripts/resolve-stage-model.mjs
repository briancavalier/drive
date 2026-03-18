import { setOutputs } from "./lib/actions-output.mjs";
import { resolveFactoryStageModel } from "./lib/factory-config.mjs";

const mode = process.env.FACTORY_MODE;
const overrideModel = process.env.FACTORY_STAGE_MODEL_OVERRIDE || "";

const model = resolveFactoryStageModel({
  mode,
  overrideModel
});

setOutputs({ model });
