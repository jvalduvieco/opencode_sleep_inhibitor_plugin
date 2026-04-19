import type { Plugin } from "@opencode-ai/plugin"
import { Logger } from "./logger.js"
import { SleepInhibitor } from "./inhibitor.js"

export { Logger, SleepInhibitor }

export const SleepInhibitorPlugin: Plugin = async (input) => {
  const inhibitor = new SleepInhibitor(new Logger(input))

  return {
    event: async ({ event }) => {
      await inhibitor.handleEvent(event)
    },
  }
}

export default SleepInhibitorPlugin