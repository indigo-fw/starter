# Schema Overrides

This directory contains project-level schema overrides for module-owned tables.

## How it works

1. A module declares a table as overridable in its `module.config.ts`:
   ```typescript
   overridableSchema: [
     { name: 'chat-user-preferences', modulePath: '@/core-chat/schema/user-preferences' },
   ]
   ```

2. The module exports **columns separately** from the table:
   ```typescript
   export const chatUserPreferenceColumns = { userId, preferredName, ... };
   export const chatUserPreferences = pgTable('chat_user_preferences', chatUserPreferenceColumns);
   ```

3. To extend, create a file here matching the override `name` (e.g., `chat-user-preferences.ts`):
   ```typescript
   import { chatUserPreferenceColumns } from '@/core-chat/schema/user-preferences';
   export const chatUserPreferences = pgTable('chat_user_preferences', {
     ...chatUserPreferenceColumns,
     myCustomField: varchar('my_custom_field', { length: 100 }),
   });
   export type ChatUserPreferences = typeof chatUserPreferences.$inferSelect;
   ```

4. Run `bun run indigo:sync` — the generated `module-schema.ts` auto-detects the override and re-exports from here instead of the module default.

5. Run `bun run db:generate` — Drizzle generates a migration adding the new columns.

## Rules

- File name must match the `name` field in the module's `overridableSchema` config
- Must re-export the same table name as the module (e.g., `chatUserPreferences`)
- Always spread the module's columns first, then add your own
- Module routers work unchanged — they import the re-exported table from `generated/module-schema.ts`, so they automatically see all columns (base + your extensions)
- Both module and project code can query all columns
- Module updates that add new base columns are automatically inherited via the spread
