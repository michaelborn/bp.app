---
name: commit-message
description: Use whenever writing commit messages for this repository (creating commits, amending, or suggesting them). Enforces conventional commits, which also drive the automated release version bumps.
---

# Commit messages: conventional commits

This repository uses [conventional commits](https://www.conventionalcommits.org).
The release workflow reads them to decide version bumps and build
`changelog.md`, so non-conforming subjects end up miscategorized.

Always write commit subjects as:

```
type(scope?): short imperative summary
```

- **Allowed types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`.
- **Subject style:** lowercase start, imperative mood ("add", not "added"), no trailing period, no wrapping words like "updates".
- **Scope** (optional, lowercase): the area touched, e.g. `fix(sync)`, `feat(chart)`, `chore(ci)`.
- **Breaking change:** add `!` before the colon (`feat(api)!: ...`) or a `BREAKING CHANGE:` footer — this triggers a major version bump, so use it deliberately.
- **Body** (optional, blank line after subject): explain *why* when it is not obvious. Keep lines wrapped around 72 chars.
- **One logical change per commit.**

Because `feat` bumps the minor version and `fix` bumps the patch, do **not**
use `feat` for cosmetic or documentation changes — prefer `docs`, `chore`, or
`refactor` so releases don't inflate.
