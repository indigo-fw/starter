# core-brand — TODO / next-up work

## Done

### Scaffolding + architecture
- Module structure (`module.config.ts`, `register.ts`, `CLAUDE.md`)
- `BrandConfig` discriminated union (TS-enforced required fields per mode)
- Runtime validator (file existence, square-source check, per-mode rules)
- **DI registration** via `setBrandConfig()` — no boundary violation. Project
  config flows through `src/config/deps/brand-deps.ts`. Idempotent.
- **SVG cache** populated at `setBrandConfig()` time — `<BrandLogo />` never
  touches the filesystem at render
- `<BrandLogo variant="mark|wordmark|lockup|auto" />` (server component, sync,
  handles all 12 variant × mode combos with sensible fallbacks)
- `getBrandMetadata()` Next.js metadata helper (sync)

### CLI
- `bun run indigo brand:generate [--check]` wired via static `scripts/indigo/brand.ts`
  wrapper (matches the existing `visualize`/`codemap` dispatch pattern)
- **End-to-end verified**: CLI loads config via `@/config/deps/brand-deps`,
  validates, emits `public/icon.svg` + `public/site.webmanifest` ✓
- Writes when `@resvg/resvg-js + to-ico` are installed:
  `favicon.ico` (multi-res 16/32/48), `icon-192.png`, `icon-512.png`,
  `apple-icon.png` (180×180) — code in place, gracefully no-ops if deps absent
- Writes when `archiver` is installed: `brand/press-kit.zip` (bundles every
  asset currently in `public/` + a `brand.json` color snapshot)
- OG: **`custom-svg` template fully implemented** AND is the new default.
  Bundled `_templates/brand/og-image.svg` (1200×630, mark + wordmark + tagline)
  rasterizes cleanly to all three social sizes. `gradient-mark` /
  `centered-lockup` templates left for later (need satori + bundled fonts).

### Module / install integration
- Registered in `scripts/indigo/registry.ts` (installable via `indigo add core-brand`)
- Wired into `indigo.config.ts` for the framework dev tree
- **`indigo:sync` run** — `src/generated/module-server.ts` now includes the
  `brand-deps` import, so `initModuleDeps()` registers the brand config at
  server boot
- `src/instrumentation.ts` updated to also import `brand-deps` (RSC context)
- Default templates in `_templates/` + scaffolded into the dev tree:
  - `src/config/brand.ts` (default Indigo brand, `custom-svg` OG)
  - `src/config/deps/brand-deps.ts`
  - `src/brand/icon.svg` (JigsawConverge mark)
  - `src/brand/og-image.svg` (1200×630 social card)

### Tests
- `__tests__/validate-config.test.ts` — 15 cases (3 modes, all error paths, formatter)
- `__tests__/BrandLogo.test.tsx` — 15 cases (12 mode × variant combos +
  defaults + className passthrough + unregistered-config error path)
- **30/30 passing**, ~1.4s runtime

### Verification
- `bun run typecheck` — clean ✓
- `bunx vitest run src/core-brand` — 30/30 pass ✓
- `bun run indigo brand:generate --check` — config validates ✓
- `bun run indigo brand:generate` — writes the asset files that don't
  need optional deps; gracefully warns about the others ✓

## TODO

### To complete the favicon + social pipeline
- **Install runtime deps**: `bun add sharp @resvg/resvg-js to-ico archiver`
  (satori only if you implement `gradient-mark`/`centered-lockup` templates)
- After install, `brand:generate` will emit the full asset set —
  `favicon.ico`, `icon-192.png`, `icon-512.png`, `apple-icon.png`,
  `og-image.png`, `og-image-dark.png`, `twitter-card.png`, `brand/press-kit.zip`
- No code changes needed — the optional-import helper detects the deps and
  the matching emitters wake up

### Optional / nice-to-have
- **OG image satori implementation** — `gradient-mark` and `centered-lockup`
  templates. Currently both fall back to a "use `custom-svg` instead" warning.
  Implement only if you don't want to maintain a hand-authored SVG. Needs
  bundled fonts (Inter/Manrope TTF in `assets/`) and JSX templates that
  read `brand.colors`.
- **`/brand` page** — register an MDX renderer for `type: brand-page`
  (per `dev/src/app/CLAUDE.md` renderer pattern). Ship MDX components:
  `<BrandHero>`, `<BrandLogoDownloads>`, `<BrandPalette>`, `<BrandTypography>`,
  `<BrandMisuseGrid>`. Default content template at `_templates/content/brand.mdx`.
- **`/press` → `/brand` redirect** in `src/proxy.ts`
- **`/api/brand/press-kit.zip`** route that serves the generated ZIP
- **`indigo doctor` integration** — call `validateBrandConfig()` as part of
  the health checks; warn if `brand.ts` mtime > generated assets mtime
- **Improve SVG validator** — current regex parser is permissive (only catches
  obvious shape issues). Use a proper SVG parser if false-positives on edge
  SVGs become a problem.
- **OG image `Resvg` type assertion** — manual cast in `cli/generate.ts`.
  Brittle if @resvg/resvg-js API changes. Acceptable but could be tightened
  with a proper `declare module` once the dep is installed.

## Push to module repo (once feature-complete)

```bash
INDIGO_MAINTAINER=1 bun run indigo push core-brand
```

## Acceptance criteria (from the PRD)

- [x] Discriminated union enforces required fields per mode at compile time
- [x] Runtime validator catches missing files + per-mode rule violations
- [x] `<BrandLogo>` renders correctly for every (mode × variant) combo with fallbacks
- [x] Module is cleanly removable via `indigo remove core-brand` (no hard-coded
      imports leak across boundary — DI pattern keeps it clean)
- [x] Validator tests cover all 3 modes + formatter (15 cases)
- [x] BrandLogo tests cover all 12 variant × mode combos + defaults + error path (15 cases)
- [x] `bun run typecheck` passes
- [x] `bun run indigo brand:generate` runs end-to-end and emits the assets
      that don't require optional deps
- [ ] Fresh `bunx degit indigo-fw/starter` install ships with all 10 asset
      files in `public/` (needs runtime deps installed + framework synced)
- [ ] `bun run indigo doctor` validates the brand config
- [ ] `/brand` page renders with downloads / palette / typography
