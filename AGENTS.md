# AGENTS.md

## Purpose

This repo implements an OpenCode plugin that targets **both OpenCode 1 and OpenCode 2**. Treat OpenCode plugin behavior and runtime compatibility as the source of truth, not generic Node plugin assumptions.

## Key OpenCode Plugin Facts

- OpenCode plugins are JavaScript or TypeScript modules.
- OpenCode 1 loads the named `server` export. The plugin function receives the OpenCode 1 context and returns a hooks object. Destructure what you need from that object; do not treat the first argument as the client itself.
- OpenCode 2 loads the module's default export, which must be a plugin object `{ id, setup(ctx) }`. `setup` may return a cleanup function.
- The module entrypoint (`src/index.ts`) must keep both exports: `export const server` (V1) and `export default { id, setup }` (V2).
- Use `client.app.log()` for structured logs on OpenCode 1. OpenCode 2's beta plugin context has no log-write client; fall back to console (`createV2Logger`).
- OpenCode 1 session events: `session.status`, `session.idle`, `session.deleted`.
- OpenCode 2 session events: `session.execution.started`, `session.execution.succeeded|failed|interrupted`, `session.deleted`, plus fine-grained step/reasoning/text/tool events. OpenCode 2 does **not** emit `session.status` / `session.idle` on the public event stream.

## Runtime Assumptions

- OpenCode uses Bun at runtime.
- npm plugins are installed by OpenCode with Bun and cached under `~/.cache/opencode/node_modules/`.
- Local plugin dependencies are installed via `bun install` from a config-directory `package.json`.
- Prefer Bun-compatible APIs and behavior when making runtime decisions.
- The `$` object exposed to OpenCode 1 plugins is Bun's shell API, not Node's child-process wrapper.

## Repo Guidance

- Keep the plugin entrypoint minimal and focused on exporting plugin hooks / plugin objects.
- Do not export unrelated runtime helpers from the main plugin entrypoint unless OpenCode explicitly expects them.
- Put reusable helpers in separate modules: `src/inhibitor.ts` (event-shape-agnostic core), `src/v1.ts` (OpenCode 1 adapter), `src/v2.ts` (OpenCode 2 adapter), `src/logger.ts`, `src/platform.ts`.
- Keep the core (`SleepInhibitor`) event-shape agnostic: adapters translate runtime events into `setSessionActive(sessionID, active)` calls.
- Track cross-event plugin state with session-keyed maps or sets, and clean up that state on `session.deleted`.
- When testing helper classes directly, import them from their dedicated module output, not from the plugin entrypoint.
- Avoid stale `dist` artifacts. Clean before build so runtime verification matches current source.

## Logging Guidance

- Structured logs should use a stable `service` name.
- Prefer concise log messages with machine-useful `extra` fields like backend name, active session count, and error message.
- When debugging plugin startup, inspect OpenCode logs under `~/.local/share/opencode/log` first.

## Loading And Installation Notes

- OpenCode loads plugins from config and plugin directories in a specific order:
  1. `~/.config/opencode/opencode.json`
  2. `opencode.json`
  3. `~/.config/opencode/plugins/`
  4. `.opencode/plugins/`
- Project-level local plugins can be placed in `.opencode/plugins/`.
- npm-distributed plugins can be listed in `opencode.json` under `plugins` (OpenCode 2) or `plugin` (OpenCode 1).
- The referenced gist uses `.opencode/plugin/` and `~/.config/opencode/plugin/` in examples, but the official docs currently document the plural `plugins/` directories. Prefer the official docs paths unless runtime evidence shows otherwise.

## Development Notes

- TypeScript plugin types for OpenCode 1 come from `@opencode-ai/plugin`. The OpenCode 2 types are kept structural in `src/v2.ts` so the published package does not depend on the OpenCode 2 beta SDK.
- Local development in this repo should use Bun commands to stay aligned with the OpenCode runtime.
- Any runtime-sensitive code should be validated against actual OpenCode logs, not only unit tests.
- Useful hooks beyond `event` include `tool.execute.before`, `tool.execute.after`, and `experimental.session.compacting` when behavior needs to intercept tools or preserve state.
- Session queries and other runtime interactions should use the OpenCode SDK client available on plugin context, such as `client.session.*`.
- When writing git messages, add `Assisted-by: OpenCode MODEL` trailers, where `MODEL` is the friendly model name.

## References

- OpenCode 1 plugin docs: `https://opencode.ai/docs/plugins/`
- OpenCode 2 plugin docs: `https://opencode.ai/v2/docs/build/plugins`
- OpenCode SDK docs: `https://opencode.ai/docs/sdk/`
- OpenCode plugin gist: `https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a`
