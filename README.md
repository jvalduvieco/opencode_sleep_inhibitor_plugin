# opencode-sleep-inhibitor

[![npm version](https://img.shields.io/npm/v/opencode-sleep-inhibitor.svg)](https://www.npmjs.com/package/opencode-sleep-inhibitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

OpenCode plugin that prevents system and screen sleep while any OpenCode session is doing work.

The plugin keeps the machine awake for all non-idle session states, including active generation, tool execution, and retry backoff. Sleep is allowed again only when every tracked session is idle.

## Compatibility

This package works with both OpenCode 1 and OpenCode 2. A single module entrypoint exposes both plugin APIs through one default export:

- **OpenCode 1** loads the `server` function from the default export. It reacts to the V1 session events (`session.status`, `session.idle`, `session.deleted`).
- **OpenCode 2** loads the `{ id, setup }` fields from the default export. It reacts to the V2 event stream (`session.execution.*` lifecycle events plus fine-grained activity events, with a grace period as a safety net).

A named `server` export is also kept for OpenCode 1 npm-package-style loading.

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
- OpenCode 2: treats a session as active from `session.execution.started` until `session.execution.succeeded|failed|interrupted` (or `session.deleted`), or while fine-grained activity events keep arriving. Sessions observed only via activity heartbeats (e.g. after a plugin reload mid-execution) are released after a 30 s grace period; sessions with an open execution lifecycle stay active regardless of quiet periods

On startup (OpenCode 1 `server` load and OpenCode 2 `setup`) the plugin logs the version it loaded, e.g.
`opencode-sleep-inhibitor loaded {"version":"0.5.0"}`, so you can confirm which copy of the plugin the service actually picked up.

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
