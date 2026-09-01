# P1 shared foundation baseline integration report

**Date:** 2026-09-01
**Target worktree:** `/Users/Zhuanz/Desktop/WePicTool/.worktrees/fun-text-stack-phase1`
**Starting point:** `40a6731` (`docs: plan fun text phase one`)

## Applied commits

The following P1 commits were cherry-picked in the required order. Git assigned new commit IDs while preserving each original feature boundary and message:

| Source | Integrated commit | Subject |
| --- | --- | --- |
| `c5af1a8` | `f11e7ad` | feat: add layered dressup registry |
| `c2f84bd` | `20a15aa` | feat: add layered dressup project model |
| `c7a4733` | `e2d38cf` | feat: add paper doll head samples |
| `5c38019` | `05f003b` | feat: add layered dressup editor |
| `af32f0c` | `9e7f044` | feat: make layered dressup the flagship entry |
| `f3e9c38` | `fcc462e` | fix: isolate upload drafts from demo edits |

`38c860f` was deliberately not included, as required.

## Conflicts and resolution

The six cherry-picks applied without conflicts. No older P1 status documentation was picked, so the confirmed fun-text design (`be23f01`), phase-one plan (`40a6731`), current-state document, and 2026-09-01 iteration record were retained rather than overwritten.

The acceptance command exposed one integration compatibility issue after the cherry-picks: the repository root sets `"type": "module"`, while `miniprogram/config/playRegistry.js` uses CommonJS. Node's direct `require()` therefore loaded it as an ES module and did not expose `getPlayDefinition`. This did not affect the existing VM-based tests, which is why they initially passed. The minimal correction is:

- add `miniprogram/package.json` declaring `"type": "commonjs"`, scoped only to the mini-program subtree;
- add a direct-require regression test to `tests/layered-dressup.test.cjs`.

This makes the brief's exact baseline gate work without changing registry data or P1 behavior.

## Changed-file review

- `miniprogram/config/playRegistry.js` registers `layered-dressup`; `getPlayDefinition('layered-dressup')` returns the available, four-group definition.
- `miniprogram/utils/layeredDressup.js` supplies the P1 immutable project model, grouped sendability, preview groups, ordering, removal, and source-mode rules.
- `miniprogram/assets/samples/head1.png` through `head3.png` provide the tested 640×640 project-owned head assets; the existing top, bottom, and shoe sample references remain intact.
- `miniprogram/pages/dressup/` and `miniprogram/app.json` provide the editor route; `miniprogram/pages/index/` makes demo and upload paths the flagship entry while retaining the existing AI outfit entry.
- `package.json` expands syntax checking to cover the P1 registry, model, and editor.
- No `fun-text-stack` production module, route, registration, renderer, or test was added.
- `docs/current.md`, `docs/iterations/2026-09-01.md`, and `README.md` describe the branch-level integration truth and outstanding true-device work. The confirmed fun-text design and plan are unchanged.

## Validation

Commands were run in the target worktree:

```text
node --test tests/layered-dressup.test.cjs
  PASS: 17 tests, 0 failures (including the direct CommonJS registry gate regression)
npm test
  PASS: 38 tests, 0 failures
npm run check:syntax
  PASS
npm run check:miniprogram
  PASS: 小程序上线预检通过
npm run lint
  PASS: tsc --noEmit completed without errors
npm run check:docs
  PASS: 文档治理检查通过
node -e "const r=require('./miniprogram/config/playRegistry'); if(!r.getPlayDefinition('layered-dressup')) process.exit(1)"
  PASS: exit 0
git diff --check
  PASS
```

## Concerns and follow-up

- This is a source-level and automated-check integration only. The P1 editor still needs WeChat Developer Tools, iOS, Android, and real WeChat chat-stack acceptance before merging to `main`.
- The new nested CommonJS package boundary is intentional for direct Node validation of mini-program modules. It does not add a fun-text implementation.
