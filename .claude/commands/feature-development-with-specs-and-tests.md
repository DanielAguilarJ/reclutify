---
name: feature-development-with-specs-and-tests
description: Workflow command scaffold for feature-development-with-specs-and-tests in reclutify.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-development-with-specs-and-tests

Use this workflow when working on **feature-development-with-specs-and-tests** in `reclutify`.

## Goal

Develop a new feature with supporting design/requirements docs, implementation, and tests.

## Common Files

- `.kiro/specs/**/*.md`
- `src/app/**/*.tsx`
- `src/app/**/*.ts`
- `src/lib/**/*.ts`
- `src/__tests__/**/*.ts`
- `docs/**/*.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Write or update design, requirements, and tasks markdown files in .kiro/specs/...
- Implement feature in src/app/ and/or src/lib/...
- Add or update tests in src/__tests__/...
- Update documentation in docs/ and/or README.md

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.