# opencode-sleep-inhibitor

[![npm version](https://img.shields.io/npm/v/opencode-sleep-inhibitor.svg)](https://www.npmjs.com/package/opencode-sleep-inhibitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

OpenCode plugin that prevents system and screen sleep while any OpenCode session is doing work.

The plugin keeps the machine awake for all non-idle session states, including active generation, tool execution, and retry backoff. Sleep is allowed again only when every tracked session is idle.

## Compatibility

This package works with both OpenCode 1 and OpenCode 2. The module has a single entrypoint that exposes both plugin APIs:

- **OpenCode 1** loads the named `server` export. It reacts to the V1 session events (`session.status`, `session.idle`, `session.deleted`).
- **OpenCode 2** loads the default export, a plugin object `{ id, setup }`. It reacts to the V2 event stream (`session.execution.*` lifecycle events plus fine-grained activity events, with a grace period as a safety net).

## Platforms

- Linux with systemd: uses `systemd-inhibit`
- macOS: uses `caffeinate`

## Install

Add the package to your OpenCode config (`plugins` in OpenCode 2, `plugin` in OpenCode 1):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-sleep-inhibitor"],
}
```

## Behavior

- Starts one inhibitor process when the first session becomes active
- Keeps that process alive while any session remains active
- Stops the inhibitor process when all sessions return to idle
- OpenCode 1: treats every session `status.type !== "idle"` as active
- OpenCode 2: treats a session as active from `session.execution.started` until `session.execution.succeeded|failed|interrupted`, or while fine-grained activity events keep arriving; stale sessions are released after a 30 s grace period

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
bun run check
bun run build
bun test test/inhibitor.test.ts
```

Then point OpenCode at the built package or publish it to npm.
