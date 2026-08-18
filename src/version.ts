import { readFileSync } from "node:fs"

/**
 * The plugin version, read from the package manifest at module load.
 *
 * The published layout is `package.json` next to `dist/`, and `src/` is next to
 * `package.json` in the repo, so resolving `../package.json` relative to this
 * module works for both the built package and local sources. Fails soft to
 * "unknown" so a missing manifest never blocks plugin startup.
 */
export const VERSION: string = (() => {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: string | number }
    return manifest.version === undefined ? "unknown" : String(manifest.version)
  } catch {
    return "unknown"
  }
})()
