---
name: conventional-commits
description: Use whenever a git commit is being created in this repository (staging, committing, amending, or suggesting commit messages). Enforces conventional commits, which drive the automated release version bumps and changelog.md.
---

# Conventional commits

Every commit subject must follow this format:

```
type(scope?): short summary in imperative mood
```

## Types

| Type | Use for | Bump |
| --- | --- | --- |
| `feat` | a user-visible feature | minor |
| `fix` | a bug fix | patch |
| `chore` | maintenance, tooling, deps, release tasks | patch* |
| `docs` | documentation only | patch* |
| `refactor` | code changes that neither fix nor add behavior | patch* |
| `test` | adding or changing tests only | patch* |
| `perf` | performance improvements | patch* |
| `ci` | CI/CD, workflows, pipelines | patch* |
| `build` | build system or dependencies | patch* |

\* bump logic: `feat` → minor, `fix` → patch, breaking → major, other types default to patch.

## Examples

```
feat: add weight tracking
feat(chart): add stack/split graph toggle
fix(sync): keep queued records when the server is unreachable
fix: prevent table inputs from overflowing on narrow screens
docs(readme): document weight export
refactor: generalize the records composable for multiple metrics
test: cover weight validation ranges
chore(release): v0.2.0
ci: run e2e tests on the development branch
```

## Rules

- **Scope** (optional, lowercase): the feature area, e.g. `feat(chart)`, `fix(sync)`.
- **Subject style**: lowercase start, imperative mood ("add", not "added" or "adds"), no trailing period.
- **Breaking changes**: add `!` before the colon (`feat(api)!: ...`) or a `BREAKING CHANGE: <explanation>` footer in the body — this triggers a major version bump, so use it deliberately.
- **Body** (optional, blank line after subject): explain *why* when the diff doesn't make it obvious; wrap around 72 chars.
- **One logical change per commit**; never mix an unrelated fix into a feature commit.
- Don't use `feat` for cosmetic or docs-only changes — that inflates the release version.
