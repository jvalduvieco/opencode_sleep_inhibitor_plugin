import type { PluginInput } from "@opencode-ai/plugin"

export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogFn = (
  level: LogLevel,
  message: string,
  extra?: Record<string, unknown>,
) => Promise<void>

export function createLogger(ctx: PluginInput): LogFn {
  return async (level, message, extra) => {
    await ctx.client.app.log({
      body: {
        service: "opencode-sleep-inhibitor",
        level,
        message,
        extra,
      },
    })
  }
}
