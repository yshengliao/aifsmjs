# Contributing to aifsmjs

Thanks for taking the time to look. aifsmjs is a deliberately small library;
contributions that keep the surface narrow are easier to accept than ones
that expand it.

## Quick start

```bash
pnpm install
pnpm test            # vitest, ~117 example tests + PBT smoke runs
pnpm coverage        # vitest with 100/100/100/90 thresholds (CI-enforced)
pnpm typecheck       # tsc --noEmit on strict mode
pnpm lint            # biome check
pnpm build           # tsup; dual ESM/CJS + .d.ts
pnpm verify:exports  # ensures package.json#exports matches dist/
pnpm check:size      # gzip per subpath against the size budget
```

The full pre-publish gate is `pnpm prepublishOnly`, which runs typecheck,
lint, coverage (with thresholds), build, exports verification, and size
budget check — in that order.

## What gets in easily

- Bug fixes with a failing test added first
- README / typing corrections
- Tests that lock down existing behaviour
- New `aifsmjs/<subpath>` opt-in modules that follow the same shape as
  `guards`, `effects`, `inspect`, `replay`, `pbt`, `timer`: independent,
  named exports only, no side effects, single responsibility

## What needs discussion first

- Anything that changes the `step()` signature or lifecycle order
- New required fields on `MachineDef` or `Snapshot`
- A change that would push the core gzip past ~3KB
- Hierarchical / parallel / actor features (v0.2+ — open an issue with the
  use case)

## Design principles

aifsmjs follows a library-core priority order:

> Security > Correctness > Simplicity > YAGNI > Performance

In particular, `step()` must remain a pure function: identical
`(def, snapshot, event, impl)` always returns identical
`{ snapshot, effects, changed }`. Any change that breaks this invariant will
be rejected.

## Commit & PR style

- Commit messages: imperative subject under 70 chars; body explains *why*.
- PRs: keep scope to one topic. Link the issue if any.
- Tests required for any behaviour change. PBT preferred for invariants;
  example tests preferred for behaviour you want documented.

## Reporting issues

- Minimal reproduction welcome (paste the smallest `defineMachine + step`
  pair that shows the bug).
- For security issues, please email the maintainer rather than filing
  publicly.

## Release flow

Releases are automated via the **Publish to npm** GitHub Action
([`.github/workflows/publish.yml`](.github/workflows/publish.yml)). The
required `NPM_TOKEN` secret is already configured at the repo level. From
a clean tree on `main`:

```bash
# 1. Bump version + create commit + create tag (single command)
pnpm version patch       # or `minor` / `major`

# 2. Push the commit AND the tag in one go
git push --follow-tags
```

The workflow triggers on `v*` tag push and runs the full gate before
publishing:

1. verify tag matches `package.json#version`
2. typecheck / lint / coverage (with 100/100/100/90 thresholds)
3. build / verify exports / check bundle sizes / verify llms-full.txt
4. `pnpm publish --provenance --access public` (npm supply-chain
   attestation is generated automatically)

A failed gate stops the publish; the tag stays on the repo but nothing
ships. If you need to test the gate without publishing, trigger the
workflow manually via `workflow_dispatch` with `dry-run: true`.

For prereleases (e.g. `0.2.0-rc.1`), tag manually with `git tag v0.2.0-rc.1 && git push --tags`. npm will mark the version with the `rc` dist-tag once published — adjust the workflow if you need a different tag strategy.

## License

By contributing, you agree your changes will be licensed under the MIT
license that covers this project.
