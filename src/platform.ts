import { existsSync } from "node:fs"

export type Backend = {
  name: string
  command: string
  args: string[]
}

export function getBackend(): Backend | undefined {
  if (process.platform === "darwin") {
    return {
      name: "caffeinate",
      command: "caffeinate",
      args: ["-dis", "-w", String(process.pid)],
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
        "sh",
        "-c",
        'while kill -0 "$1" 2>/dev/null; do sleep 1; done',
        "sh",
        String(process.pid),
      ],
    }
  }

  return undefined
}
