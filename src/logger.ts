export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogFn = (
  level: LogLevel,
  message: string,
  extra?: Record<string, unknown>,
) => Promise<void>

const SERVICE = "opencode-sleep-inhibitor"

/**
 * Minimal structural view of the OpenCode 1 plugin context needed for logging.
 * Kept structural so the published types do not depend on the OpenCode 1 SDK.
 */
export type OpenCode1PluginInput = {
  client: {
    app: {
      log(input: {
        body: {
          service: string
          level: LogLevel
          message: string
          extra?: Record<string, unknown>
        }
      }): unknown
    }
  }
}

/**
 * Structured logging for OpenCode 1: writes through `client.app.log()` so the
 * entries appear in the OpenCode server logs with a stable service name.
 */
export function createLogger(ctx: OpenCode1PluginInput): LogFn {
  return async (level, message, extra) => {
    await ctx.client.app.log({
      body: {
        service: SERVICE,
        level,
        message,
        extra,
      },
    })
  }
}

/**
 * Fallback logging for OpenCode 2. The V2 plugin context has no log-write
 * client in the beta API, so entries go to stdout/stderr of the service.
 */
export function createV2Logger(): LogFn {
  return async (level, message, extra) => {
    const write = (line: string) => {
      if (level === "warn" || level === "error") {
        console.warn(line)
      } else {
        console.info(line)
      }
    }
    const suffix =
      extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : ""
    write(`[${SERVICE}] ${message}${suffix}`)
  }
}
