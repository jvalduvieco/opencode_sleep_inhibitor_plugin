# AGENTS.md

## Purpose

This repo implements an OpenCode plugin. Treat OpenCode plugin behavior and runtime compatibility as the source of truth, not generic Node plugin assumptions.

## Key OpenCode Plugin Facts

- OpenCode plugins are JavaScript or TypeScript modules that export one or more plugin functions.
- Each plugin function receives the OpenCode context and returns a hooks object.
- The plugin function receives a single context object. Destructure what you need from that object; do not treat the first argument as the client itself.
- The documented plugin context includes `project`, `directory`, `worktree`, `client`, and `$`.
- Use `client.app.log()` for structured logs instead of `console.log()`.
- Relevant session events for this repo include `session.status`, `session.idle`, and `session.deleted`.

## Runtime Assumptions

- OpenCode uses Bun at runtime.
- npm plugins are installed by OpenCode with Bun and cached under `~/.cache/opencode/node_modules/`.
- Local plugin dependencies are installed via `bun install` from a config-directory `package.json`.
- Prefer Bun-compatible APIs and behavior when making runtime decisions.
- The `$` object exposed to plugins is Bun's shell API, not Node's child-process wrapper.

## Repo Guidance

- Keep the plugin entrypoint minimal and focused on exporting plugin hook functions.
- Do not export unrelated runtime helpers from the main plugin entrypoint unless OpenCode explicitly expects them.
- Put reusable helpers in separate modules like `src/logger.ts`, `src/inhibitor.ts`, and `src/platform.ts`.
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
- npm-distributed plugins can be listed in `opencode.json` under `plugin`.
- The referenced gist uses `.opencode/plugin/` and `~/.config/opencode/plugin/` in examples, but the official docs currently document the plural `plugins/` directories. Prefer the official docs paths unless runtime evidence shows otherwise.

## Development Notes

- TypeScript plugin types come from `@opencode-ai/plugin`.
- Local development in this repo should use Bun commands to stay aligned with the OpenCode runtime.
- Any runtime-sensitive code should be validated against actual OpenCode logs, not only unit tests.
- Useful hooks beyond `event` include `tool.execute.before`, `tool.execute.after`, and `experimental.session.compacting` when behavior needs to intercept tools or preserve state.
- Session queries and other runtime interactions should use the OpenCode SDK client available on plugin context, such as `client.session.*`.
- When writing git messages, add `Assisted-by: OpenCode MODEL` trailers, where `MODEL` is the friendly model name.

## References

- OpenCode plugin docs: `https://opencode.ai/docs/plugins/`
- OpenCode SDK docs: `https://opencode.ai/docs/sdk/`
- OpenCode plugin gist: `https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a`
