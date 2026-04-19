import type { PluginInput } from "@opencode-ai/plugin"

export class Logger {
  private logFn: (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => Promise<void>

  constructor(input: PluginInput) {
    this.logFn = async (level, message, extra) => {
      await input.client.app.log({
        body: {
          service: "opencode-sleep-inhibitor-plugin",
          level,
          message,
          extra,
        },
      })
    }
  }

  static fromLogFn(logFn: (level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => Promise<void>) {
    const logger = new Logger({} as any)
    logger.logFn = logFn
    return logger
  }

  async write(level: "debug" | "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
    await this.logFn(level, message, extra)
  }
}