import assert from "node:assert"
import { EventEmitter } from "node:events"
import { describe, it } from "node:test"
import type { Event } from "@opencode-ai/sdk"
import { SleepInhibitor } from "src/inhibitor.js"
import { getBackend } from "src/platform.js"
import { createV1Hooks, type Hooks } from "src/v1.js"
import { createV2Plugin, createV2Tracker, type V2Event } from "src/v2.js"
import { VERSION } from "src/version.js"
import pluginModule from "src/index.js"

describe("SleepInhibitor (core)", () => {
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

    it("enables inhibition when the first session becomes active", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.setSessionActive("session-1", true)
      await flush()

      assert.strictEqual(children.length, 1)
      assert.deepStrictEqual(messages(logs), ["Sleep inhibition enabled."])
    })

    it("does not start a second inhibitor for additional active sessions", async () => {
      const { children, inhibitor } = createHarness()

      await inhibitor.setSessionActive("session-1", true)
      await inhibitor.setSessionActive("session-2", true)
      await flush()

      assert.strictEqual(children.length, 1)
    })

    it("treats repeated active signals for the same session idempotently", async () => {
      const { children, inhibitor } = createHarness()

      await inhibitor.setSessionActive("session-1", true)
      await inhibitor.setSessionActive("session-1", true)
      await flush()

      assert.strictEqual(children.length, 1)
    })
  })

  describe("deactivation", () => {
    it("disables inhibition when the only active session becomes idle", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.setSessionActive("session-1", true)
      await flush()
      await inhibitor.setSessionActive("session-1", false)

      assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
      assert.deepStrictEqual(messages(logs), [
        "Sleep inhibition enabled.",
        "Sleep inhibition disabled.",
      ])
    })

    it("stays enabled while another session is still active", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.setSessionActive("session-a", true)
      await inhibitor.setSessionActive("session-b", true)
      await flush()
      await inhibitor.setSessionActive("session-a", false)

      assert.deepStrictEqual(children[0]?.killCalls, [])
      assert.deepStrictEqual(messages(logs), ["Sleep inhibition enabled."])
    })

    it("disables inhibition after the last active session is cleared", async () => {
      const { children, inhibitor, logs } = createHarness()

      await inhibitor.setSessionActive("session-a", true)
      await inhibitor.setSessionActive("session-b", true)
      await flush()
      await inhibitor.setSessionActive("session-a", false)
      await inhibitor.setSessionActive("session-b", false)

      assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
      assert.deepStrictEqual(messages(logs), [
        "Sleep inhibition enabled.",
        "Sleep inhibition disabled.",
      ])
    })

    it("stop() kills the backend process", async () => {
      const { children, inhibitor } = createHarness()

      await inhibitor.setSessionActive("session-a", true)
      await flush()
      await inhibitor.stop()

      assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
    })
  })
})

describe("V1 adapter", () => {
  it("activates on a busy session.status", async () => {
    const { hooks, children, logs } = createV1Harness()

    await hooks.event({ event: statusEvent("session-1", "busy") })
    await flush()

    assert.strictEqual(children.length, 1)
    assert.deepStrictEqual(messages(logs), ["Sleep inhibition enabled."])
  })

  it("activates on a retry session.status", async () => {
    const { hooks, children } = createV1Harness()

    await hooks.event({ event: statusEvent("session-1", "retry") })
    await flush()

    assert.strictEqual(children.length, 1)
  })

  it("deactivates on an idle session.status", async () => {
    const { hooks, children } = createV1Harness()

    await hooks.event({ event: statusEvent("session-1", "busy") })
    await flush()
    await hooks.event({ event: statusEvent("session-1", "idle") })

    assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
  })

  it("deactivates on session.idle", async () => {
    const { hooks, children } = createV1Harness()

    await hooks.event({ event: statusEvent("session-1", "busy") })
    await flush()
    await hooks.event({ event: idleEvent("session-1") })

    assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
  })

  it("deactivates on session.deleted", async () => {
    const { hooks, children } = createV1Harness()

    await hooks.event({ event: statusEvent("session-1", "busy") })
    await flush()
    await hooks.event({ event: deletedEvent("session-1") })

    assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
  })

  it("stays enabled while another session is still active", async () => {
    const { hooks, children, logs } = createV1Harness()

    await hooks.event({ event: statusEvent("session-a", "busy") })
    await hooks.event({ event: statusEvent("session-b", "busy") })
    await flush()
    await hooks.event({ event: idleEvent("session-a") })

    assert.deepStrictEqual(children[0]?.killCalls, [])
    assert.deepStrictEqual(messages(logs), ["Sleep inhibition enabled."])
  })

  it("ignores unrelated events", async () => {
    const { hooks, children, logs } = createV1Harness()

    await hooks.event({
      event: { type: "unknown.event", properties: {} } as Event,
    })
    await flush()

    assert.strictEqual(children.length, 0)
    assert.deepStrictEqual(logs, [])
  })
})

describe("V2 tracker", () => {
  it("activates on session.execution.started", async () => {
    const { tracker, children, logs } = createV2Harness()

    await tracker.handleEvent(v2Event("session.execution.started", "session-1"))
    await flush()

    assert.strictEqual(children.length, 1)
    assert.deepStrictEqual(messages(logs), ["Sleep inhibition enabled."])
  })

  it("deactivates on session.execution.succeeded", async () => {
    const { tracker, children } = createV2Harness()

    await tracker.handleEvent(v2Event("session.execution.started", "session-1"))
    await flush()
    await tracker.handleEvent(
      v2Event("session.execution.succeeded", "session-1"),
    )

    assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
  })

  it("deactivates on session.execution.failed and interrupted", async () => {
    for (const end of [
      "session.execution.failed",
      "session.execution.interrupted",
    ]) {
      const { tracker, children } = createV2Harness()

      await tracker.handleEvent(
        v2Event("session.execution.started", "session-1"),
      )
      await flush()
      await tracker.handleEvent(v2Event(end, "session-1"))

      assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
    }
  })

  it("treats fine-grained activity events as heartbeats that activate", async () => {
    for (const type of [
      "session.step.started",
      "session.reasoning.started",
      "session.text.started",
      "session.tool.called",
      "session.retry.scheduled",
      "session.compaction.started",
    ]) {
      const { tracker, children } = createV2Harness()

      await tracker.handleEvent(v2Event(type, "session-1"))
      await flush()

      assert.strictEqual(children.length, 1, `expected activation for ${type}`)
    }
  })

  it("deactivates on session.deleted", async () => {
    const { tracker, children } = createV2Harness()

    await tracker.handleEvent(v2Event("session.execution.started", "session-1"))
    await flush()
    await tracker.handleEvent(v2Event("session.deleted", "session-1"))

    assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
  })

  it("keeps an executing session active until its lifecycle end event", async () => {
    let now = 0
    const { tracker, children } = createV2Harness(() => now)

    await tracker.handleEvent(v2Event("session.execution.started", "session-1"))
    await flush()

    // Long-running work that stays quiet past the grace period must NOT be
    // released while its execution lifecycle is still open.
    now = 100_000
    await tracker.sync()
    assert.deepStrictEqual(children[0]?.killCalls, [])

    await tracker.handleEvent(
      v2Event("session.execution.succeeded", "session-1"),
    )
    assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
  })

  it("releases heartbeat-only sessions whose activity went stale after the grace period", async () => {
    let now = 0
    const { tracker, children } = createV2Harness(() => now)

    // Heartbeat observed without an execution lifecycle (e.g. the plugin
    // subscribed mid-execution).
    await tracker.handleEvent(v2Event("session.step.started", "session-1"))
    await flush()

    now = 10_000 // graceMs is 5000; last activity was at t=0
    await tracker.sync()

    assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
  })

  it("keeps recently active heartbeat-only sessions across a sync", async () => {
    let now = 0
    const { tracker, children } = createV2Harness(() => now)

    await tracker.handleEvent(v2Event("session.step.started", "session-1"))
    await flush()

    now = 4_000 // within graceMs of 5000
    await tracker.sync()
    assert.deepStrictEqual(children[0]?.killCalls, [])

    now = 6_000 // t=0 activity expired (6000 > 5000)
    await tracker.sync()
    assert.deepStrictEqual(children[0]?.killCalls, ["SIGTERM"])
  })

  it("ignores unrelated events", async () => {
    const { tracker, children, logs } = createV2Harness()

    await tracker.handleEvent({ type: "catalog.updated", data: {} })
    await flush()

    assert.strictEqual(children.length, 0)
    assert.deepStrictEqual(logs, [])
  })

  it("ignores events without a session id", async () => {
    const { tracker, children } = createV2Harness()

    await tracker.handleEvent({ type: "session.execution.started", data: {} })
    await flush()

    assert.strictEqual(children.length, 0)
  })
})

describe("V2 plugin (setup wiring)", () => {
  it("subscribes to the event stream and reacts to lifecycle events", async () => {
    const calls: Array<[string, boolean]> = []
    const fakeInhibitor = {
      setSessionActive: async (id: string, active: boolean) => {
        calls.push([id, active])
      },
      stop: async () => {},
    }
    const fakeCtx = createFakeCtx([
      v2Event("session.execution.started", "session-1"),
      v2Event("session.execution.succeeded", "session-1"),
    ])

    const plugin = createV2Plugin({
      createInhibitor: () => fakeInhibitor as unknown as SleepInhibitor,
      logger: async () => {},
    })
    const cleanup = plugin.setup(fakeCtx.ctx)

    await flush()
    try {
      assert.deepStrictEqual(calls, [
        ["session-1", true],
        ["session-1", false],
      ])
    } finally {
      cleanup()
    }

    assert.strictEqual(fakeCtx.signal()?.aborted, true)
  })

  it("cleanup stops the inhibitor and aborts the stream", async () => {
    let stopCalls = 0
    const fakeInhibitor = {
      setSessionActive: async () => {},
      stop: async () => {
        stopCalls += 1
      },
    }
    const fakeCtx = createFakeCtx([])
    const plugin = createV2Plugin({
      createInhibitor: () => fakeInhibitor as unknown as SleepInhibitor,
      logger: async () => {},
    })

    const cleanup = plugin.setup(fakeCtx.ctx)
    await flush()
    cleanup()

    assert.strictEqual(stopCalls, 1)
    assert.strictEqual(fakeCtx.signal()?.aborted, true)
  })
})

describe("entrypoint (dual export)", () => {
  it("default export satisfies the OpenCode 2 plugin schema", () => {
    assert.strictEqual(pluginModule.id, "opencode-sleep-inhibitor")
    assert.strictEqual(typeof pluginModule.setup, "function")
  })

  it("default export also carries the OpenCode 1 `server` loader", () => {
    assert.strictEqual(typeof pluginModule.server, "function")
  })

  it("named `server` export is still available", async () => {
    const named = (await import("src/index.js")).server
    assert.strictEqual(typeof named, "function")
  })

  it("logs the loaded package version when the V1 server starts", async () => {
    const logs: string[] = []
    const hooks = (await pluginModule.server({
      client: {
        app: {
          log: async (input: {
            body: {
              service: string
              level: string
              message: string
              extra?: Record<string, unknown>
            }
          }) => {
            logs.push(
              `${input.body.level}:${input.body.message}:${JSON.stringify(input.body.extra)}`,
            )
          },
        },
      },
    })) as unknown as Hooks

    assert.strictEqual(typeof hooks.event, "function")
    assert.ok(
      logs.some((entry) => entry.includes(`"version":"${VERSION}"`)),
      `expected a startup log carrying version=${VERSION}, got ${JSON.stringify(logs)}`,
    )
  })

  it("logs the loaded package version when the V2 plugin setup runs", async () => {
    const logs: string[] = []
    const plugin = createV2Plugin({
      logger: async (level, message, extra) => {
        logs.push(`${level}:${message}:${JSON.stringify(extra)}`)
      },
      createInhibitor: () =>
        ({
          setSessionActive: async () => {},
          stop: async () => {},
        }) as unknown as SleepInhibitor,
    })

    const fakeCtx = createFakeCtx([])
    const cleanup = plugin.setup(fakeCtx.ctx)
    await flush()
    cleanup()

    assert.deepStrictEqual(
      logs.filter((entry) => entry.includes("loaded")),
      [`info:opencode-sleep-inhibitor loaded:{"version":"${VERSION}"}`],
    )
  })

  it("VERSION is a non-empty string that matches the package manifest", async () => {
    assert.ok(typeof VERSION === "string" && VERSION.length > 0)

    const manifest = (await import("../package.json", {
      with: { type: "json" },
    })) as { default: { version: string } }
    assert.strictEqual(VERSION, manifest.default.version)
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

function v2Event(type: string, sessionID: string): V2Event {
  return { type, data: { sessionID } }
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

function createV1Harness() {
  const { children, inhibitor, logs } = createHarness()
  const hooks: Hooks = createV1Hooks(inhibitor)
  return { hooks, children, logs }
}

function createV2Harness(now: () => number = Date.now) {
  const { children, inhibitor, logs } = createHarness()
  const tracker = createV2Tracker(inhibitor, { graceMs: 5_000, now })
  return { tracker, children, logs }
}

function createFakeCtx(eventsToEmit: unknown[]) {
  let signal: AbortSignal | undefined

  const subscribe = (options?: { signal?: AbortSignal }) => {
    signal = options?.signal
    return makeStream(eventsToEmit, () => signal)
  }

  return {
    ctx: { event: { subscribe } },
    signal: () => signal,
  }
}

async function* makeStream(
  items: unknown[],
  getSignal: () => AbortSignal | undefined,
): AsyncIterable<unknown> {
  for (const item of items) yield item
  const currentSignal = getSignal()
  if (!currentSignal) return
  await new Promise<void>((resolve) => {
    currentSignal.addEventListener("abort", () => resolve(), { once: true })
  })
}

function messages(logs: TestLogEntry[]) {
  return logs.map((entry) => entry.message)
}

async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve))
  await new Promise<void>((resolve) => setImmediate(resolve))
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
