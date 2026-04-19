import { existsSync } from "node:fs"
import type { Backend } from "./types.js"

export function getBackend(): Backend | undefined {
  if (process.platform === "darwin") {
    return {
      name: "caffeinate",
      command: "caffeinate",
      args: ["-dis"],
    }
  }

  if (process.platform === "linux" && existsSync("/run/systemd/system")) {
    return {
      name: "systemd-inhibit",
      command: "systemd-inhibit",
      args: [
        "--what=sleep:idle",
        "--who=OpenCode",
        "--why=OpenCode is active",
        "sleep",
        "infinity",
      ],
    }
  }

  return undefined
}