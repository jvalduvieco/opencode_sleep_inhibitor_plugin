# opencode-sleep-inhibitor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

OpenCode plugin that prevents system and screen sleep while any OpenCode session is non-idle.

The plugin keeps the machine awake for all non-idle session states, including active generation, tool execution, and retry backoff. Sleep is allowed again only when every tracked session is idle.

## Platforms

- Linux with systemd: uses `systemd-inhibit`
- macOS: uses `caffeinate`

## Install

Add the package to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sleep-inhibitor"]
}
```

## Behavior

- Starts one inhibitor process when the first session becomes non-idle
- Keeps that process alive while any session remains non-idle
- Stops the inhibitor process when all sessions return to `idle`
- Treats every `status.type !== "idle"` as active

## Backends

### Linux

Runs:

```sh
systemd-inhibit --what=sleep:idle --who=OpenCode --why="OpenCode is active" sleep infinity
```

### macOS

Runs:

```sh
caffeinate -dis
```

## Cleanup

The plugin automatically stops the inhibition process when:

- All sessions return to idle
- OpenCode exits (SIGINT, SIGTERM, SIGHUP, or process exit)

This ensures the system does not stay inhibited if OpenCode crashes or is terminated unexpectedly.

## Local development

```sh
bun install
bun run build
bun test src/index.test.ts
```

Then point OpenCode at the built package or publish it to npm.
