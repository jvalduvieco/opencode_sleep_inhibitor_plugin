import { SleepInhibitor } from "./inhibitor.js"
import { createV2Logger, type LogFn } from "./logger.js"

/**
 * OpenCode 2 plugin shape: a module default export with a unique `id` and a
 * `setup(ctx)` function that may return a cleanup function.
 */
export type V2Plugin = {
  id: string
  setup: (ctx: V2Context) => V2Cleanup
}

export type V2Cleanup = () => void | Promise<void>

/**
 * The subset of the OpenCode 2 plugin context this plugin uses. Kept structural
 * (and minimal) so the published types do not depend on the OpenCode 2 beta SDK.
 */
export type V2Context = {
  event: {
    subscribe: (options?: { signal?: AbortSignal }) => AsyncIterable<unknown>
  }
}

/** The public OpenCode 2 event stream event subset this plugin reacts to. */
export type V2Event = {
  type: string
  data?: { sessionID?: string }
}

export type V2Options = {
  /**
   * How long a session stays considered active after its last activity
   * heartbeat when no lifecycle end event has been observed.
   * @default 30_000
   */
  graceMs?: number
  /** How often to sweep stale activity and re-check the inhibitor. @default 10_000 */
  checkIntervalMs?: number
  logger?: LogFn
  /** Clock for tests. @default Date.now */
  now?: () => number
  /** Inhibitor factory for tests. */
  createInhibitor?: () => SleepInhibitor
}

/**
 * Events that prove a session is doing work right now in OpenCode 2.
 *
 * The V2 public event stream does not emit coarse `session.status` /
 * `session.idle` events; it emits `session.execution.*` lifecycle events plus
 * fine-grained step/reasoning/text/tool events.
 */
export const ACTIVITY_EVENTS = new Set([
  "session.execution.started",
  "session.step.started",
  "session.reasoning.started",
  "session.text.started",
  "session.tool.called",
  "session.retry.scheduled",
  "session.compaction.started",
])

/** Lifecycle events that mark the end of a session's busy window. */
export const END_EVENTS = new Set([
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
])

/**
 * Event-shape-agnostic tracker used by the OpenCode 2 adapter. Kept separate from
 * the plugin wiring so it can be unit tested without a live event stream.
 */
export function createV2Tracker(
  inhibitor: SleepInhibitor,
  options: V2Options = {},
) {
  const graceMs = options.graceMs ?? 30_000
  const now = options.now ?? Date.now

  // Sessions with an open execution (`session.execution.started` seen without a
  // matching end event).
  const executing = new Set<string>()
  // sessionID -> timestamp of the last activity heartbeat observed.
  const lastActivity = new Map<string, number>()

  async function handleEvent(raw: unknown) {
    const event = raw as V2Event
    const sessionID = event.data?.sessionID
    if (!sessionID) return

    if (ACTIVITY_EVENTS.has(event.type)) {
      executing.add(sessionID)
      lastActivity.set(sessionID, now())
      await inhibitor.setSessionActive(sessionID, true)
      return
    }

    if (END_EVENTS.has(event.type) || event.type === "session.deleted") {
      executing.delete(sessionID)
      lastActivity.delete(sessionID)
      await inhibitor.setSessionActive(sessionID, false)
    }
  }

  /**
   * Release sessions whose activity went stale (no heartbeat for more than the
   * grace period). Safety net for reloads and missed lifecycle events.
   */
  async function sync() {
    const tick = now()

    for (const sessionID of [...executing]) {
      const last = lastActivity.get(sessionID) ?? 0
      if (tick - last > graceMs) {
        executing.delete(sessionID)
        lastActivity.delete(sessionID)
        await inhibitor.setSessionActive(sessionID, false)
      }
    }

    for (const [sessionID, last] of [...lastActivity]) {
      if (tick - last > graceMs) {
        lastActivity.delete(sessionID)
        await inhibitor.setSessionActive(sessionID, false)
      }
    }
  }

  return { handleEvent, sync, executingCount: () => executing.size }
}

/**
 * The OpenCode 2 plugin: `{ id, setup(ctx) }`. `setup` subscribes to the server
 * event stream, tracks busy sessions, and returns a cleanup that tears the
 * subscription, the sweep timer, and the inhibitor backend down.
 */
export function createV2Plugin(options: V2Options = {}): V2Plugin {
  return {
    id: "opencode-sleep-inhibitor",
    setup: (ctx) => {
      const logger = options.logger ?? createV2Logger()
      const inhibitor =
        options.createInhibitor?.() ?? new SleepInhibitor(logger)
      const tracker = createV2Tracker(inhibitor, options)

      const controller = new AbortController()
      const stream = ctx.event.subscribe({ signal: controller.signal })

      void (async () => {
        try {
          for await (const event of stream) {
            if (controller.signal.aborted) break
            await tracker.handleEvent(event)
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            await logger(
              "warn",
              `Event stream closed unexpectedly: ${String(error)}`,
            )
          }
        }
      })()

      const timer = setInterval(() => {
        void tracker.sync()
      }, options.checkIntervalMs ?? 10_000)

      return () => {
        controller.abort()
        clearInterval(timer)
        void inhibitor.stop()
      }
    },
  }
}
