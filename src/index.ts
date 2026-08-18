import type { Plugin } from "@opencode-ai/plugin"
import { createLogger } from "./logger.js"
import { SleepInhibitor } from "./inhibitor.js"
import { createV1Hooks } from "./v1.js"
import { createV2Plugin, type V2Plugin } from "./v2.js"

// The shared inhibitor backend, wired to the OpenCode 1 hook contract.
const server: Plugin = async (input) => {
  return createV1Hooks(new SleepInhibitor(createLogger(input)))
}

// The OpenCode 2 plugin object.
const v2: V2Plugin = createV2Plugin()

// Single module default export that satisfies both runtimes:
// - OpenCode 1 loads the `server` function (a default export object with `server`).
// - OpenCode 2 loads the `id` + `setup` plugin object.
export default {
  id: v2.id,
  setup: v2.setup,
  server,
}

// Named export kept for OpenCode 1 npm-package-style loading.
export { server }
