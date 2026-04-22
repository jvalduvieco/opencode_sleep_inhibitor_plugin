---
name: release-procedure
description: Cut a tagged release for this plugin with the required verification, commit, push, and post-release checks.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: github
---

## When To Use Me

Use this when preparing a new tagged release of this plugin.

## Release Steps

- Update `package.json` to the target version.
- Run the required verification commands:

```bash
bun run format:check
bun run lint
bun run build
bun run test
```

- Commit the version bump on `main` with the required trailer:

```bash
git add package.json
git commit -m "Release X.Y.Z" \
  -m "Publish version X.Y.Z." \
  -m "Assisted-by: OpenCode MODEL"
```

- Create and push the matching tag:

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

## Important Notes

- The pushed tag must match `package.json` exactly, for example `v0.2.0` for version `0.2.0`.
- The publish workflow validates the tag and version before `bun publish`.
- The publish workflow runs both `bun run test` and `bun run build`, so `dist/` is regenerated on clean checkouts before publishing.

## Post-Release Checks

```bash
gh run list --limit 10
gh release view vX.Y.Z
```
