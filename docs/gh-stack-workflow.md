# GitHub Stack Workflow

This project uses stacked pull requests for feature development.

The goal is to keep each review small, explicit, and safe while still allowing larger product work to move forward as a sequence of dependent changes.

## Core Idea

A stack is a chain of branches where each branch builds on the previous one:

```text
main
  -> feat/visual-capture-contracts
    -> feat/playwright-coordinate-mapper
      -> feat/playwright-visual-state-capture
        -> feat/local-artifact-storage
```

Each branch becomes one pull request. The first PR targets `main`. Each subsequent PR targets the previous branch.

This means a large feature can be reviewed in layers:

```text
PR 1: contracts and ports
PR 2: mapper implementation
PR 3: Playwright adapter
PR 4: local storage implementation
```

Each PR should be understandable on its own and should keep the project passing `npm run verify`.

## Why This Project Uses Stacked PRs

This project has strict architectural boundaries and a research-critical data pipeline. Large unstructured pull requests are risky because they make it hard to review:

- domain language consistency;
- Clean Architecture boundaries;
- Playwright isolation;
- dataset annotation correctness;
- coordinate conversion;
- storage behavior;
- test coverage;
- future cloud compatibility.

Stacked PRs keep each change small enough to review properly.

## Size Rule

Prefer small branches.

A useful target is up to roughly 300 changed lines per branch. This is a guideline, not a hard mathematical limit, but crossing it should trigger a question:

```text
Can this branch be split into a smaller lower-level PR and a higher-level PR?
```

A good stack branch usually does one thing:

- adds a port;
- adds a mapper;
- adds a storage implementation;
- adds a strategy skeleton;
- adds one FSM transition;
- adds tests for one behavior group;
- wires existing components together.

Avoid branches that mix unrelated concerns, such as:

- Playwright setup plus storage plus dashboard changes;
- scraper implementation plus scheduler implementation;
- domain model rename plus cloud deployment;
- tests plus unrelated refactors.

## Commit Rule

All commits must follow the scoped Conventional Commits format:

```text
type(module): subject
```

Examples:

```text
feat(playwright-capture): add visual state capture adapter
fix(coordinate-mapper): normalize document-relative boxes
test(retry-policy): cover retry exhaustion
docs(gh-stack): document stacked pr workflow
```

The scope must identify the module being changed. Use concise kebab-case scopes, such as:

- `architecture`;
- `gh-stack`;
- `leaflet-domain`;
- `dataset-capture`;
- `coordinate-mapper`;
- `playwright-capture`;
- `artifact-storage`;
- `carnauba-extraction`;
- `scheduler`;
- `dashboard`;
- `tooling`.

## Required Quality Gate

Before submitting or updating a stack, run:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24
npm run verify
```

`npm run verify` must pass before opening or updating PRs.

It checks:

- TypeScript typecheck;
- test typecheck;
- ESLint;
- Prettier formatting;
- Vitest coverage;
- production build.

## Starting A New Stack

Start from an updated `main`:

```bash
git checkout main
git pull --ff-only origin main
```

Create a stack with explicit branch names:

```bash
gh stack init \
  feat/visual-capture-contracts \
  feat/playwright-coordinate-mapper \
  feat/playwright-visual-state-capture
```

The first branch is based on `main`. Each next branch is based on the branch before it.

Use branch names that describe the layer, not the entire macro feature.

Good branch names:

```text
feat/visual-capture-contracts
feat/playwright-coordinate-mapper
feat/local-artifact-storage
feat/carnauba-anchor-navigation
```

Weak branch names:

```text
feat/all-scraping
feat/big-feature
feat/fixes
feat/misc
```

## Working On A Stack Branch

After creating the stack, work on the current branch.

Typical flow:

```bash
git status
# edit files
npm run verify
git add .
git commit -m "feat(visual-capture): add capture port"
```

Then move up the stack:

```bash
gh stack up
```

Or move down:

```bash
gh stack down
```

Useful navigation commands:

```bash
gh stack view
gh stack view --short
gh stack top
gh stack bottom
gh stack trunk
gh stack up
gh stack down
gh stack switch
```

## Adding A Branch To An Existing Stack

Use `gh stack add` to add a new branch on top of the current stack:

```bash
gh stack add feat/local-artifact-storage
```

You can also stage and commit while adding:

```bash
gh stack add -Am "feat(artifact-storage): add local artifact storage" feat/local-artifact-storage
```

Prefer explicit branch names over generated names when the branch is part of a planned stack.

## Submitting A Stack

Submit the full stack:

```bash
gh stack submit
```

This command:

1. pushes all stack branches;
2. creates PRs for branches without PRs;
3. updates base branches for existing PRs;
4. creates or updates the stack on GitHub.

New PRs are drafts by default. Keep them as drafts while the stack is still being prepared.

When the stack is ready for review:

```bash
gh stack submit --open
```

Use `--auto` only when auto-generated PR titles are good enough:

```bash
gh stack submit --auto
```

For this project, prefer writing clear PR titles manually unless the stack is mechanical.

## Syncing A Stack

Use sync frequently:

```bash
gh stack sync
```

This command:

1. fetches latest remote changes;
2. fast-forwards the trunk branch;
3. cascade-rebases stack branches onto their updated parents;
4. pushes stack branches safely;
5. syncs PR state from GitHub.

If PRs were merged and local stack branches can be removed:

```bash
gh stack sync --prune
```

## Rebasing A Stack

When automatic sync cannot resolve conflicts, use:

```bash
gh stack rebase
```

After fixing conflicts:

```bash
gh stack rebase --continue
```

To abandon the rebase:

```bash
gh stack rebase --abort
```

Useful variants:

```bash
gh stack rebase --downstack
gh stack rebase --upstack
gh stack rebase --no-trunk
```

Use these only when the target scope is clear.

## Modifying A Stack

Use:

```bash
gh stack modify
```

This opens an interactive TUI that can:

- drop branches;
- fold branches into adjacent branches;
- insert branches;
- reorder branches;
- rename branches.

After modifying a stack that already has PRs:

```bash
gh stack submit
```

This updates the remote PR stack.

## Checking Out An Existing Stack

To fetch and check out a stack from GitHub:

```bash
gh stack checkout <pr-number>
```

or:

```bash
gh stack checkout <pr-url>
```

or:

```bash
gh stack checkout <branch-name>
```

If no argument is provided, `gh stack checkout` opens a menu.

## PR Review Rule

PRs should be reviewed from bottom to top:

```text
PR 1: closest to main
PR 2: depends on PR 1
PR 3: depends on PR 2
```

Reviewers should not need to understand the whole macro feature to approve the first PR. The first PR should be valuable and correct on its own.

## PR Title And Description Standard

All pull requests must be written in English.

PR titles must follow this format:

```text
Type(subject): Branch-Message
```

Where:

- `Type` is the conventional change type with the first letter capitalized;
- `subject` is the scoped module, using kebab-case;
- `Branch-Message` is a short human-readable summary derived from the branch purpose.

Examples:

```text
Feat(visual-capture): Add visual capture contracts
Feat(coordinate-mapper): Add playwright coordinate mapper
Fix(dataset-capture): Normalize document-relative bounding boxes
Docs(gh-stack): Document stacked pull request workflow
```

PR descriptions must use exactly this structure:

```md
## Summary

Text explaining the purpose of the PR.

## What Changed

Text explaining the concrete changes made in this PR.

## Testing

- [x] npm run verify
- [x] Manual validation not required

## Conclusion

Text explaining the final result, validation status, and any relevant next step.
```

Do not omit sections. The `Testing` section is mandatory for every PR. If a PR does not require manual validation, state that explicitly.

Example:

```md
## Summary

Adds the application-level contracts required for visual state capture without introducing Playwright dependencies outside infrastructure.

## What Changed

Created the visual capture and artifact storage ports, defined typed input/output contracts, and added tests for the new mapper behavior.

## Testing

- [x] npm run verify
- [x] Manual validation not required

## Conclusion

The project now has the application boundary needed for future Playwright capture adapters. Validation passes with `npm run verify`.
```

## Merge Rule

Merge from bottom to top.

Do not merge a higher PR before its base PR is merged.

After a lower PR is merged:

```bash
gh stack sync --prune
```

Then continue with the next PR.

## First Expected Macro Stack

The first macro feature should be the visual capture foundation.

Recommended initial stack:

```text
main
  -> feat/visual-capture-contracts
    -> feat/playwright-coordinate-mapper
      -> feat/playwright-visual-state-capture
        -> feat/local-artifact-storage
```

### PR 1: `feat/visual-capture-contracts`

Purpose:

- define visual capture application ports;
- define artifact storage port if needed by capture;
- define input/output contracts;
- keep Playwright out of application/domain.

Expected scope:

```text
feat(visual-capture): add capture contracts
```

### PR 2: `feat/playwright-coordinate-mapper`

Purpose:

- map Playwright-like geometry into domain bounding boxes;
- convert viewport-relative coordinates to document-relative coordinates;
- normalize boxes for training pipelines;
- validate invalid/null geometry cases.

Expected scope:

```text
feat(coordinate-mapper): add playwright coordinate mapper
```

### PR 3: `feat/playwright-visual-state-capture`

Purpose:

- implement the Playwright visual capture adapter;
- receive page, locator, state name, and semantic label;
- produce a `VisualDatasetSample`;
- rely on the coordinate mapper from the previous PR.

Expected scope:

```text
feat(playwright-capture): add visual state capture adapter
```

### PR 4: `feat/local-artifact-storage`

Purpose:

- implement local artifact storage;
- persist screenshots and future leaflet artifacts;
- keep the storage swappable for Google Cloud Storage later.

Expected scope:

```text
feat(artifact-storage): add local artifact storage
```

## What Not To Do

Do not:

- work directly on `main`;
- submit a giant PR for a macro feature;
- mix dashboard, scraping, storage, and scheduler changes in one branch;
- merge stack PRs out of order;
- bypass `npm run verify`;
- create commits without scopes;
- add Playwright code outside infrastructure;
- add a strategy that skips visual dataset capture.

## Quick Reference

```bash
# Start stack
gh stack init feat/layer-one feat/layer-two

# View stack
gh stack view --short

# Add branch on top
gh stack add feat/layer-three

# Navigate
gh stack up
gh stack down
gh stack top
gh stack bottom
gh stack trunk

# Submit PRs
gh stack submit
gh stack submit --open

# Sync with remote
gh stack sync
gh stack sync --prune

# Rebase
gh stack rebase
gh stack rebase --continue
gh stack rebase --abort
```
