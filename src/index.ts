import type { Plugin } from "@opencode-ai/plugin"
import { createLogger } from "./logger.js"
import { SleepInhibitor } from "./inhibitor.js"

export const server: Plugin = async (input) => {
  const inhibitor = new SleepInhibitor(createLogger(input))

  return {
    event: async ({ event }) => {
      await inhibitor.handleEvent(event)
    },
  }
}

export default server
