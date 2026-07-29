---
name: add-or-update-database-table-or-function
description: Workflow command scaffold for add-or-update-database-table-or-function in reclutify.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-database-table-or-function

Use this workflow when working on **add-or-update-database-table-or-function** in `reclutify`.

## Goal

Add or update a database table, function, or privilege, including migrations and related backend changes.

## Common Files

- `supabase/migrations/*.sql`
- `supabase/repair_*.sql`
- `src/lib/database.types.ts`
- `src/app/api/**/*.ts`
- `src/__tests__/**/*.ts`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update SQL migration files in supabase/migrations/ (e.g., add table, function, RLS, revoke privileges).
- Update supabase/repair or foundation SQL scripts if needed.
- Update src/lib/database.types.ts to reflect new/changed database types.
- Update backend logic or API handlers to use new/changed tables or functions.
- Update or add tests to cover new/changed logic.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.