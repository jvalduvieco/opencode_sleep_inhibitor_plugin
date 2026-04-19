import { describe, it } from "node:test"
import assert from "node:assert"
import type { Event } from "@opencode-ai/sdk"
import { Logger, SleepInhibitor } from "../dist/index.js"

function createMockLogger() {
  const logs: Array<{ level: string; message: string }> = []
  return {
    logs,
    logger: Logger.fromLogFn(async (level: string, message: string) => {
      logs.push({ level, message })
    }),
  }
}

describe("SleepInhibitor", () => {
  describe("handleEvent", () => {
    it("should track session as active when status is busy", async () => {
      const { logger } = createMockLogger()
      const inhibitor = new SleepInhibitor(logger)

      const event: Event = {
        type: "session.status",
        properties: {
          sessionID: "session-1",
          status: { type: "busy" },
        },
      }

      await inhibitor.handleEvent(event as any)

      const activeSessions = (inhibitor as any).activeSessions
      assert.strictEqual(activeSessions.has("session-1"), true, "Session should be tracked as active")
    })

    it("should track session as active when status is retry", async () => {
      const { logger } = createMockLogger()
      const inhibitor = new SleepInhibitor(logger)

      const event: Event = {
        type: "session.status",
        properties: {
          sessionID: "session-2",
          status: { type: "retry", attempt: 1, message: "error", next: 1000 },
        },
      }

      await inhibitor.handleEvent(event as any)

      const activeSessions = (inhibitor as any).activeSessions
      assert.strictEqual(activeSessions.has("session-2"), true, "Session should be tracked as active during retry")
    })

    it("should remove session when status is idle", async () => {
      const { logger } = createMockLogger()
      const inhibitor = new SleepInhibitor(logger)

      const busyEvent: Event = {
        type: "session.status",
        properties: {
          sessionID: "session-3",
          status: { type: "busy" },
        },
      }
      await inhibitor.handleEvent(busyEvent as any)

      const idleEvent: Event = {
        type: "session.status",
        properties: {
          sessionID: "session-3",
          status: { type: "idle" },
        },
      }
      await inhibitor.handleEvent(idleEvent as any)

      const activeSessions = (inhibitor as any).activeSessions
      assert.strictEqual(activeSessions.has("session-3"), false, "Session should be removed when idle")
    })

    it("should handle session.idle event", async () => {
      const { logger } = createMockLogger()
      const inhibitor = new SleepInhibitor(logger)

      const busyEvent: Event = {
        type: "session.status",
        properties: {
          sessionID: "session-4",
          status: { type: "busy" },
        },
      }
      await inhibitor.handleEvent(busyEvent as any)

      const idleEvent: Event = {
        type: "session.idle",
        properties: {
          sessionID: "session-4",
        },
      }
      await inhibitor.handleEvent(idleEvent as any)

      const activeSessions = (inhibitor as any).activeSessions
      assert.strictEqual(activeSessions.has("session-4"), false, "Session should be removed after session.idle event")
    })

    it("should handle session.deleted event", async () => {
      const { logger } = createMockLogger()
      const inhibitor = new SleepInhibitor(logger)

      const busyEvent: Event = {
        type: "session.status",
        properties: {
          sessionID: "session-5",
          status: { type: "busy" },
        },
      }
      await inhibitor.handleEvent(busyEvent as any)

      const deletedEvent: Event = {
        type: "session.deleted",
        properties: {
          info: { id: "session-5", projectID: "proj-1", directory: "/test", title: "Test", version: "1.0.0", time: { created: Date.now(), updated: Date.now() } },
        },
      }
      await inhibitor.handleEvent(deletedEvent as any)

      const activeSessions = (inhibitor as any).activeSessions
      assert.strictEqual(activeSessions.has("session-5"), false, "Session should be removed after session.deleted event")
    })

    it("should ignore unknown event types", async () => {
      const { logger } = createMockLogger()
      const inhibitor = new SleepInhibitor(logger)

      const unknownEvent: Event = {
        type: "unknown.event" as any,
        properties: {},
      }

      await inhibitor.handleEvent(unknownEvent as any)

      const activeSessions = (inhibitor as any).activeSessions
      assert.strictEqual(activeSessions.size, 0, "Unknown events should not affect session tracking")
    })
  })

  describe("multiple sessions", () => {
    it("should track multiple concurrent sessions", async () => {
      const { logger } = createMockLogger()
      const inhibitor = new SleepInhibitor(logger)

      await inhibitor.handleEvent({
        type: "session.status",
        properties: { sessionID: "session-a", status: { type: "busy" } },
      } as any)

      await inhibitor.handleEvent({
        type: "session.status",
        properties: { sessionID: "session-b", status: { type: "busy" } },
      } as any)

      const activeSessions = (inhibitor as any).activeSessions
      assert.strictEqual(activeSessions.size, 2, "Should track multiple sessions")
    })
  })
})