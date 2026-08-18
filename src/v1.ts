import type { Event } from "@opencode-ai/sdk"
import type { SleepInhibitor } from "./inhibitor.js"

/**
 * The hooks object OpenCode 1 expects from a plugin `server` function.
 */
export type Hooks = {
  event: (input: { event: Event }) => Promise<void>
}

/**
 * OpenCode 1 adapter.
 *
 * Translates the OpenCode 1 session events (`session.status`, `session.idle`,
 * `session.deleted`) into `SleepInhibitor` state changes.
 */
export function createV1Hooks(inhibitor: SleepInhibitor): Hooks {
  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.status": {
          await inhibitor.setSessionActive(
            event.properties.sessionID,
            event.properties.status.type !== "idle",
          )
          break
        }
        case "session.idle": {
          await inhibitor.setSessionActive(event.properties.sessionID, false)
          break
        }
        case "session.deleted": {
          await inhibitor.setSessionActive(event.properties.info.id, false)
          break
        }
      }
    },
  }
}
