# Indigo Core

Core framework for [Indigo](https://github.com/indigo-fw/starter). Provides reusable infrastructure: components, hooks, CRUD utilities, RBAC policy, design tokens, and type definitions.

This repo is consumed via `git subtree` in Indigo projects. You don't install it as a package.

## Usage

In an Indigo project:

```bash
# Add core as subtree (first time)
git subtree add --prefix=src/core git@github.com:indigo-fw/core.git main --squash

# Pull core updates
git subtree pull --prefix=src/core git@github.com:indigo-fw/core.git main --squash
```

## Structure

```
components/   — CmsFormShell, RichTextEditor, SEOFields, TagInput, MediaPickerDialog, etc.
config/       — ContentTypeDeclaration, TaxonomyDeclaration interfaces + factory helpers
crud/         — admin-crud, taxonomy-helpers, cms-helpers, content-revisions, slug-redirects
hooks/        — useCmsFormState, useCmsAutosave, useListViewState, useBulkActions, etc.
lib/          — slug, markdown, audit, webhooks, queue, redis, logger, payment services
policy/       — Role, Policy, Capability, isSuperAdmin
store/        — preferences-store, theme-store, sidebar-store, toast-store (Zustand)
styles/       — tokens.css (OKLCH design tokens), admin.css, overlay.css
types/        — PostType, ContentStatus, FileType, ContentSnapshot, billing, notifications
```

## License

[AGPL-3.0](LICENSE) — same as Indigo. See [COMMERCIAL-LICENSE.md](https://github.com/indigo-fw/starter/blob/main/COMMERCIAL-LICENSE.md) for proprietary use.
