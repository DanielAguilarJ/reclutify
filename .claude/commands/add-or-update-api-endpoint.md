---
name: add-or-update-api-endpoint
description: Workflow command scaffold for add-or-update-api-endpoint in reclutify.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-api-endpoint

Use this workflow when working on **add-or-update-api-endpoint** in `reclutify`.

## Goal

Add a new API endpoint or update an existing one, including route handler, related logic, and tests.

## Common Files

- `src/app/api/**/*.ts`
- `src/lib/**/*.ts`
- `src/__tests__/**/*.ts`
- `docs/**/*.md`
- `README.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update route handler in src/app/api/...
- Update or create supporting logic in src/lib/...
- Update or add corresponding tests in src/__tests__/...
- Document the endpoint or update related documentation.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.