# Task 9 Fix Report

## Scope

Fix the Task 9 review findings from base `7f2d736` while preserving the later P2.2, result-page, and preview-fallback behavior.

## Root Cause

The editor rendered arrow-only ordering controls and invoked `onMoveCard` directly. It therefore had neither the specified `movable-area` / `movable-view` lifecycle nor a single commit point for a drag. The text controls also exposed the older `onStartEditText` and `onConfirmEditText` names rather than the Task 9 contract.

## RED

```text
node --test tests/fun-text-editor-page.test.cjs
7 tests: 3 passed, 4 failed
```

The failures showed that the WXML was still bound to `onStartEditText`, the declared text handlers were absent, and no `movable-view` lifecycle binding existed.

## GREEN

- Replaced arrow ordering controls with WXML `movable-area` / `movable-view` bindings to `onSortStart`, `onSortMove`, and `onSortEnd`.
- Recorded the source index on start; calculated the target index from the nearest thumbnail center during movement; called real `funTextProject.moveCard` only from end.
- Reset lifecycle state before the move, so repeated end events cannot duplicate it; movement events only update the proposed destination.
- Rebuilt thumbnail coordinates and labels after the move, retaining contiguous scene order and “微信封面” for the first thumbnail.
- Renamed and bound the text actions to `onEditText` and `onConfirmText`.
- Added page tests that obtain real handler names from WXML and drive the third-to-first `start → move → end` path, including the duplicate-event guard.

## Verification

```text
node --test tests/fun-text-editor-page.test.cjs tests/fun-text-project.test.cjs
21 passed, 0 failed

npm test && npm run check:syntax && npm run check:miniprogram && npm run lint && npm run check:docs && git diff --check
156 passed, 0 failed; all governance checks passed
```

## Scope Guard

Only the Task 9 editor page, its focused tests, and required current-state/iteration documentation changed. P2.2 planning, result handling, and preview fallback code were left intact.
