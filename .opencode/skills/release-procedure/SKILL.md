---
name: release-procedure
description: Cut a tagged release of this plugin safely. Includes pre-flight checks for npm credentials and GitHub immutable-tag traps, verification, commit, push, and post-release checks.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  workflow: github
---

## When To Use Me

Use when preparing or cutting a new tagged release of this plugin.

## Release Preconditions (run BEFORE pushing the tag)

Do not skip these. Missing them is what turns a release into a multi-hour
incident (stale npm token, permanently reserved tag names).

### 1. Version bump must be on `main`

- `package.json` version must be bumped **and merged to `main` first**.
- This repo's `main` is protected: direct pushes are rejected
  (`push declined due to repository rule violations`). Land the bump through a
  pull request (e.g. branch `release/vX.Y.Z` → PR → merge).
- Verify after merge: `git show origin/main:package.json` reports the new version.

### 2. Verify the tag name is NOT permanently reserved (Critical)

**Immutable Releases trap:** This repository may have GitHub Immutable Releases
enabled. Once a tag has been published as a release, that **tag name is
permanently reserved** on the repo. Deleting the tag or the release does NOT
free the name — only GitHub Support can clear it. This survives even repository
deletion/recreation.

- Symptom: `git push origin vX.Y.Z` fails with:
  `GH013: Repository rule violations ... Cannot create ref due to creations being restricted.`
  while throwaway tags (e.g. `v0.3.0-final`) push fine, and the repo's rules
  page shows `matchingRulesets: []` (i.e. no actual ruleset is blocking it).
- Resolution: **bump the version** (e.g. `0.3.0` → `0.4.0`). Never reuse a
  reserved tag name.
- Prevention: **never delete a release tag from origin.** If publishing fails,
  fix the root cause and re-run the workflow or re-push the same tag — do not
  delete and re-create the tag.

### 3. Verify npm credentials are valid

- Check the secret exists: `gh secret list` (expect `NPM_TOKEN`).
- `bun publish` fails with `404 Not Found` on the packument URL
  (`... does not exist in this registry`) when `NPM_TOKEN` is stale, expired,
  or revoked — npm's registry answers publish PUTs with invalid/empty tokens as
  404, even though the package clearly exists (`npm view <pkg>` works).
- Update before tagging if needed: `gh secret set NPM_TOKEN`
  (requires a fresh npm access token from the maintainer's npm account).
- Optional local validation: `npm whoami` (reads the token), or a dry-run pack.

### 4. Run the verification suite

```bash
bun run format:check
bun run lint
bun run build
bun run test
```

### 5. Confirm the tag does not already exist

`git ls-remote --tags origin vX.Y.Z` should return nothing. Pushing an existing
tag is an update, not a create, and may be rejected or trigger nothing.

## Release Steps

- Update `package.json` to the target version.
- Run the required verification commands (see precondition 4).
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

- The pushed tag must match `package.json` exactly, e.g. `v0.2.0` for version `0.2.0`.
- The publish workflow validates the tag and version before `bun publish`.
- The publish workflow runs both `bun run test` and `bun run build`, so `dist/`
  is regenerated on clean checkouts before publishing.
- The publish workflow runs `bun publish --access public` with
  `NPM_CONFIG_TOKEN` set from the `NPM_TOKEN` secret. Use `NPM_CONFIG_TOKEN`,
  not `NODE_AUTH_TOKEN` (bun reads the former).
- If `bun publish` fails, nothing is published — diagnose (usually the npm
  token) and re-run. Do NOT delete the release tag.
- If the workflow already created a GitHub release and this repo has immutable
  releases enabled, the tag name is permanently reserved even after deleting
  the release and tag. Bump the version instead.
- Re-running a tag-triggered workflow (`gh run rerun`) is fine but requires the
  tag to still exist; a deleted tag makes the re-run fail at checkout.

## Post-Release Checks

```bash
gh run list --limit 10
gh release view vX.Y.Z
npm view opencode-sleep-inhibitor versions      # confirm the new version is live
```

- Confirm the "Publish" workflow completed and the GitHub release was created.
- If the workflow failed at the `bun publish` step with a 404, fix
  `NPM_TOKEN` (precondition 3) and re-run; do not touch the tag.
