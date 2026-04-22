import assert from "node:assert"
import { EventEmitter } from "node:events"
import { describe, it } from "node:test"
import type { Event } from "@opencode-ai/sdk"
import { SleepInhibitor } from "src/inhibitor.js"
import { getBackend } from "src/platform.js"

describe("SleepInhibitor", () => {
  describe("activation", () => {
    it("uses a backend command that exits with the plugin process", () => {
      const backend = getBackend()

      if (!backend) assert.fail("No backend available")

      if (process.platform === "darwin") {
        assert.deepStrictEqual(backend.args, [
          "-dis",
          "-w",
          String(process.pid),
        ])
        return
      }

      if (process.platform === "linux") {
        assert.deepStrictEqual(backend.args, [
          "--what=sleep:idle",
          "--who=OpenCode",
          "--why=OpenCode is active",
          "sh",
          "-c",
          'while kill -0 "$1" 2>/dev/null; do sleep 1; done',
          "sh",
          String(process.pid),
        ])
      }
    })

    it("enables inhibition when the first session becomes busy", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.handleEvent(statusEvent("session-1", "busy"))
      await flush()

      assert.strictEqual(children.length, 1)
      assert.deepStrictEqual(messages(logs), ["Sleep inhibition enabled."])
    })

    it("does not start a second inhibitor for additional active sessions", async () => {
      const { children, inhibitor } = createHarness()

      await inhibitor.handleEvent(statusEvent("session-1", "busy"))
      await inhibitor.handleEvent(statusEvent("session-2", "retry"))
      await flush()

      assert.strictEqual(children.length, 1)
    })
  })

  describe("deactivation", () => {
    it("disables inhibition when the only busy session becomes idle", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.handleEvent(statusEvent("session-1", "busy"))
      await flush()
      await inhibitor.handleEvent(statusEvent("session-1", "idle"))

      assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
      assert.deepStrictEqual(messages(logs), [
        "Sleep inhibition enabled.",
        "Sleep inhibition disabled.",
      ])
    })

    it("stays enabled while another session is still active", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.handleEvent(statusEvent("session-a", "busy"))
      await inhibitor.handleEvent(statusEvent("session-b", "busy"))
      await flush()
      await inhibitor.handleEvent(idleEvent("session-a"))

      assert.deepStrictEqual(children[0]?.killCalls, [])
      assert.deepStrictEqual(messages(logs), ["Sleep inhibition enabled."])
    })

    it("disables inhibition after the last active session emits session.idle", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.handleEvent(statusEvent("session-a", "busy"))
      await inhibitor.handleEvent(statusEvent("session-b", "busy"))
      await flush()
      await inhibitor.handleEvent(idleEvent("session-a"))
      await inhibitor.handleEvent(idleEvent("session-b"))

      assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
      assert.deepStrictEqual(messages(logs), [
        "Sleep inhibition enabled.",
        "Sleep inhibition disabled.",
      ])
    })

    it("disables inhibition after the last active session is deleted", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.handleEvent(statusEvent("session-a", "busy"))
      await flush()
      await inhibitor.handleEvent(deletedEvent("session-a"))

      assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
      assert.deepStrictEqual(messages(logs), [
        "Sleep inhibition enabled.",
        "Sleep inhibition disabled.",
      ])
    })
  })

  describe("other events", () => {
    it("ignores unrelated events", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.handleEvent({
        type: "unknown.event" as Event["type"],
        properties: {},
      } as Event)
      await flush()

      assert.strictEqual(children.length, 0)
      assert.deepStrictEqual(logs, [])
    })
  })
})

function statusEvent(
  sessionID: string,
  type: "busy" | "idle" | "retry",
): Event {
  return {
    type: "session.status",
    properties: {
      sessionID,
      status:
        type === "retry"
          ? { type: "retry", attempt: 1, message: "retry", next: 100 }
          : { type },
    },
  } as Event
}

function idleEvent(sessionID: string): Event {
  return {
    type: "session.idle",
    properties: { sessionID },
  } as Event
}

function deletedEvent(sessionID: string): Event {
  const now = Date.now()

  return {
    type: "session.deleted",
    properties: {
      info: {
        id: sessionID,
        projectID: "proj-1",
        directory: "/test",
        title: "Test",
        version: "1.0.0",
        time: { created: now, updated: now },
      },
    },
  } as Event
}

function createHarness() {
  const logs: TestLogEntry[] = []
  const children: FakeChildProcess[] = []

  const inhibitor = new SleepInhibitor(
    async (level, message, extra) => {
      logs.push({ level, message, extra })
    },
    (() => {
      const child = new FakeChildProcess()
      children.push(child)
      queueMicrotask(() => {
        child.emit("spawn")
      })
      return child as any
    }) as any,
    () => ({
      name: "systemd-inhibit",
      command: "systemd-inhibit",
      args: ["sleep", "infinity"],
    }),
  )

  return { children, inhibitor, logs }
}

function messages(logs: TestLogEntry[]) {
  return logs.map((entry) => entry.message)
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

type TestLogEntry = {
  level: string
  message: string
  extra?: Record<string, unknown>
}

class FakeChildProcess extends EventEmitter {
  killCalls: string[] = []

  kill(signal: string) {
    this.killCalls.push(signal)
    return true
  }
}
