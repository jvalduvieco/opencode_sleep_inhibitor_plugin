import type { Plugin } from "@opencode-ai/plugin"
import { createLogger } from "./logger.js"
import { SleepInhibitor } from "./inhibitor.js"
import { createV1Hooks } from "./v1.js"
import { createV2Plugin } from "./v2.js"

// OpenCode 1 entry: the named `server` export returns the V1 hooks object.
// OpenCode 1 reads the `server` named export; the default export below is the
// OpenCode 2 plugin object and is ignored by OpenCode 1.
export const server: Plugin = async (input) => {
  return createV1Hooks(new SleepInhibitor(createLogger(input)))
}

// OpenCode 2 entry: the default export must be a plugin object `{ id, setup }`.
export default createV2Plugin()

export { SleepInhibitor } from "./inhibitor.js"
export { getBackend, type Backend } from "./platform.js"
export {
  createLogger,
  createV2Logger,
  type LogFn,
  type LogLevel,
} from "./logger.js"
export { createV1Hooks, type Hooks } from "./v1.js"
export {
  createV2Plugin,
  createV2Tracker,
  type V2Cleanup,
  type V2Context,
  type V2Event,
  type V2Options,
  type V2Plugin,
} from "./v2.js"
