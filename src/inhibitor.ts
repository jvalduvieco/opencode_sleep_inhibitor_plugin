import { spawn, type ChildProcess } from "node:child_process"
import type {
  Event,
  EventSessionDeleted,
  EventSessionIdle,
  EventSessionStatus,
} from "@opencode-ai/sdk"
import type { LogFn } from "./logger.js"
import { getBackend, type Backend } from "./platform.js"

type SpawnProcess = typeof spawn

export class SleepInhibitor {
  private readonly activeSessions = new Set<string>()
  private child?: ChildProcess
  private unsupportedWarningShown = false
  private unavailableBackend = false

  constructor(
    private readonly log: LogFn,
    private readonly spawnProcess: SpawnProcess = spawn,
    private readonly getBackendForPlatform: () =>
      | Backend
      | undefined = getBackend,
  ) {
    this.installCleanupHandlers()
  }

  async handleEvent(event: Event) {
    switch (event.type) {
      case "session.status": {
        const sessionEvent = event as EventSessionStatus
        this.setSessionActive(
          sessionEvent.properties.sessionID,
          sessionEvent.properties.status.type !== "idle",
        )
        break
      }
      case "session.idle": {
        const idleEvent = event as EventSessionIdle
        this.setSessionActive(idleEvent.properties.sessionID, false)
        break
      }
      case "session.deleted": {
        const deletedEvent = event as EventSessionDeleted
        this.setSessionActive(deletedEvent.properties.info.id, false)
        break
      }
      default:
        return
    }

    await this.reconcile()
  }

  private setSessionActive(sessionID: string, active: boolean) {
    if (active) {
      this.activeSessions.add(sessionID)
      return
    }

    this.activeSessions.delete(sessionID)
  }

  private async reconcile() {
    if (this.activeSessions.size === 0) {
      await this.stop()
      return
    }

    if (this.child || this.unavailableBackend) return

    const backend = this.getBackendForPlatform()
    if (!backend) {
      if (!this.unsupportedWarningShown) {
        this.unsupportedWarningShown = true
        await this.log(
          "warn",
          "Sleep inhibition is not available on this platform.",
          {
            platform: process.platform,
          },
        )
      }
      this.unavailableBackend = true
      return
    }

    try {
      const child = this.spawnProcess(backend.command, backend.args, {
        stdio: "ignore",
      })

      this.child = child

      child.once("spawn", () => {
        void this.log("info", "Sleep inhibition enabled.", {
          backend: backend.name,
          activeSessions: this.activeSessions.size,
        })
      })

      child.once("error", (error) => {
        this.child = undefined
        this.unavailableBackend = true
        void this.log("warn", "Failed to start sleep inhibition backend.", {
          backend: backend.name,
          error: error.message,
        })
      })

      child.once("exit", (code, signal) => {
        const expected = this.child !== child
        this.child = undefined
        if (expected || this.activeSessions.size === 0) return
        void this.log(
          "warn",
          "Sleep inhibition backend exited while OpenCode was still active.",
          {
            backend: backend.name,
            code: code ?? undefined,
            signal: signal ?? undefined,
          },
        )
      })
    } catch (error) {
      this.unavailableBackend = true
      await this.log("warn", "Failed to initialize sleep inhibition backend.", {
        backend: backend.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async stop() {
    if (!this.child) return

    const child = this.child
    this.child = undefined
    child.kill("SIGTERM")

    await this.log("info", "Sleep inhibition disabled.")
  }

  private installCleanupHandlers() {
    const cleanup = () => {
      if (!this.child) return
      this.child.kill("SIGTERM")
      this.child = undefined
    }

    const register = (event: NodeJS.Signals | "exit") => {
      process.once(event, cleanup)
    }

    register("exit")
    register("SIGINT")
    register("SIGTERM")
    register("SIGHUP")
  }
}
