import { spawn, type ChildProcess } from "node:child_process"
import type { Logger } from "./logger.js"
import { getBackend } from "./platform.js"
import type { Event, EventSessionStatus, EventSessionIdle, EventSessionDeleted } from "@opencode-ai/sdk"

export class SleepInhibitor {
  private readonly activeSessions = new Set<string>()
  private child?: ChildProcess
  private unsupportedWarningShown = false
  private unavailableBackend = false

  constructor(private readonly logger: Logger) {
    this.installCleanupHandlers()
  }

  async handleEvent(event: Event) {
    if (event.type === "session.status") {
      const sessionEvent = event as EventSessionStatus
      await this.handleStatus(sessionEvent.properties.sessionID, sessionEvent.properties.status)
      return
    }

    if (event.type === "session.idle") {
      const idleEvent = event as EventSessionIdle
      await this.handleIdle(idleEvent.properties.sessionID)
      return
    }

    if (event.type === "session.deleted") {
      const deletedEvent = event as EventSessionDeleted
      await this.handleIdle(deletedEvent.properties.info.id)
    }
  }

  private async handleStatus(sessionID: string, status: EventSessionStatus["properties"]["status"]) {
    if (status.type === "idle") {
      this.activeSessions.delete(sessionID)
    } else {
      this.activeSessions.add(sessionID)
    }

    await this.reconcile()
  }

  private async handleIdle(sessionID: string) {
    this.activeSessions.delete(sessionID)
    await this.reconcile()
  }

  private async reconcile() {
    if (this.activeSessions.size === 0) {
      await this.stop()
      return
    }

    if (this.child || this.unavailableBackend) return

    const backend = getBackend()
    if (!backend) {
      if (!this.unsupportedWarningShown) {
        this.unsupportedWarningShown = true
        await this.logger.write("warn", "Sleep inhibition is not available on this platform.", {
          platform: process.platform,
        })
      }
      this.unavailableBackend = true
      return
    }

    try {
      const child = spawn(backend.command, backend.args, {
        stdio: "ignore",
      })

      child.once("spawn", () => {
        void this.logger.write("info", "Sleep inhibition enabled.", {
          backend: backend.name,
          activeSessions: this.activeSessions.size,
        })
      })

      child.once("error", (error) => {
        this.child = undefined
        this.unavailableBackend = true
        void this.logger.write("warn", "Failed to start sleep inhibition backend.", {
          backend: backend.name,
          error: error.message,
        })
      })

      child.once("exit", (code, signal) => {
        const expected = this.child !== child
        this.child = undefined
        if (expected || this.activeSessions.size === 0) return
        void this.logger.write("warn", "Sleep inhibition backend exited while OpenCode was still active.", {
          backend: backend.name,
          code: code ?? undefined,
          signal: signal ?? undefined,
        })
      })

      this.child = child
    } catch (error) {
      this.unavailableBackend = true
      await this.logger.write("warn", "Failed to initialize sleep inhibition backend.", {
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

    await this.logger.write("info", "Sleep inhibition disabled.")
  }

  private installCleanupHandlers() {
    const cleanup = () => {
      if (!this.child) return
      this.child.kill("SIGTERM")
      this.child = undefined
    }

    const register = (event: NodeJS.Signals | "exit") => {
      const handler = () => cleanup()
      process.once(event, handler)
    }

    register("exit")
    register("SIGINT")
    register("SIGTERM")
    register("SIGHUP")
  }
}