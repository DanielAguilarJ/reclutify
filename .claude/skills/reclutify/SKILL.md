```markdown
# reclutify Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill outlines the core development patterns, coding conventions, and workflows used in the **reclutify** TypeScript codebase. It covers file naming, import/export styles, testing practices, and step-by-step guides for common backend and feature development tasks. Use this as a reference for contributing to or maintaining the project.

## Coding Conventions

### File Naming

- **CamelCase** is used for file names.
  - Example: `userProfile.ts`, `databaseTypes.ts`

### Import Style

- **Alias imports** are preferred.
  - Example:
    ```typescript
    import { getUserById } from '@/lib/userService';
    ```

### Export Style

- **Named exports** are used throughout the codebase.
  - Example:
    ```typescript
    export function getUserById(id: string) { ... }
    export const USER_STATUS = { ACTIVE: 'active', INACTIVE: 'inactive' };
    ```

### Commit Messages

- **Conventional commit** style with prefixes (e.g., `fix:`).
  - Example: `fix: correct user role assignment logic`

## Workflows

### Add or Update Database Table or Function

**Trigger:** When you need to create, modify, or secure a database table or function (including migrations and privileges).  
**Command:** `/new-table`

1. **Create or update SQL migration files** in `supabase/migrations/`.
   - Example: `supabase/migrations/20240612_add_candidates_table.sql`
2. **Update repair or foundation SQL scripts** if needed.
   - Example: `supabase/repair_indexes.sql`
3. **Update TypeScript database types** in `src/lib/database.types.ts` to match new/changed schema.
   - Example:
     ```typescript
     export type Candidate = {
       id: string;
       name: string;
       // ...
     };
     ```
4. **Update backend logic or API handlers** to use the new/changed tables or functions.
   - Example: `src/app/api/candidates/create.ts`
5. **Update or add tests** to cover the new/changed logic.
   - Example: `src/__tests__/candidates.test.ts`

---

### Add or Update API Endpoint

**Trigger:** When exposing new backend functionality via an API route or modifying an existing endpoint.  
**Command:** `/new-endpoint`

1. **Create or update the route handler** in `src/app/api/...`.
   - Example: `src/app/api/jobs/list.ts`
2. **Update or create supporting logic** in `src/lib/...`.
   - Example: `src/lib/jobService.ts`
3. **Update or add corresponding tests** in `src/__tests__/...`.
   - Example: `src/__tests__/jobs.test.ts`
4. **Document the endpoint** or update related documentation.
   - Example: `docs/api/jobs.md` or `README.md`

---

### Feature Development with Specs and Tests

**Trigger:** When building a significant new feature or repairing a major subsystem.  
**Command:** `/new-feature`

1. **Write or update design/requirements/tasks** in `.kiro/specs/...`.
   - Example: `.kiro/specs/candidate-matching.md`
2. **Implement the feature** in `src/app/` and/or `src/lib/`.
   - Example: `src/app/candidate/match.ts`
3. **Add or update tests** in `src/__tests__/...`.
   - Example: `src/__tests__/candidateMatching.test.ts`
4. **Update documentation** in `docs/` and/or `README.md`.
   - Example: `docs/features/candidate-matching.md`

## Testing Patterns

- **Test framework:** [vitest](https://vitest.dev/)
- **Test files:** Use the `*.test.ts` pattern, colocated in `src/__tests__/`.
- **Test example:**
  ```typescript
  // src/__tests__/userService.test.ts
  import { describe, it, expect } from 'vitest';
  import { getUserById } from '@/lib/userService';

  describe('getUserById', () => {
    it('returns user for valid id', async () => {
      const user = await getUserById('123');
      expect(user).toBeDefined();
    });
  });
  ```

## Commands

| Command        | Purpose                                                            |
|----------------|--------------------------------------------------------------------|
| /new-table     | Add or update a database table, function, or privilege             |
| /new-endpoint  | Add or update an API endpoint and related logic/tests              |
| /new-feature   | Start a new feature with specs, implementation, and documentation  |
```