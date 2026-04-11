---
title: Ofte stillede spørgsmål
type: page
description: Ofte stillede spørgsmål om [[SITE_NAME]] — installation, tilpasning, indholdsstyring og udrulning.
seoTitle: "FAQ | [[SITE_NAME]]"
noindex: false
---

## Generelle spørgsmål

### Hvad er [[SITE_NAME]]?

[[SITE_NAME]] er en AI-agentdrevet CMS- og SaaS-starter med åben kildekode, bygget på T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Den tilbyder et komplet indholdsstyringssystem med SaaS-primitiver som organisationer, fakturering og realtidsnotifikationer.

### Hvem er [[SITE_NAME]] til?

[[SITE_NAME]] er designet til udviklere og teams, der bygger SaaS-produkter, marketingsider, blogs eller andre indholdsdrevne applikationer. Det er særligt velegnet til projekter, der udnytter AI-assisterede udviklingsarbejdsgange.

### Er [[SITE_NAME]] gratis at bruge?

Ja. [[SITE_NAME]] er åben kildekode under AGPL-3.0-licensen. Du kan bruge det frit til ethvert projekt. Kommercielle licenser er tilgængelige, hvis du har brug for proprietær udrulning uden AGPL-kravene.

## Tekniske spørgsmål

### Hvilken teknikstack bruger [[SITE_NAME]]?

[[SITE_NAME]] er bygget med Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL og Better Auth. Det understøtter også Redis til caching og hastighedsbegrænsning, BullMQ til baggrundsjobs og WebSockets til realtidsfunktioner.

### Hvordan udrulles [[SITE_NAME]]?

[[SITE_NAME]] kan udrulles overalt, hvor Node.js understøttes. Populære valg inkluderer Vercel, Railway, Fly.io og enhver VPS med Docker. Du skal bruge en PostgreSQL-database og eventuelt Redis for fuld funktionalitet.

### Kan jeg tilpasse designet?

Absolut. [[SITE_NAME]] bruger et OKLCH-designtokensystem med Tailwind CSS v4. Du kan rebrande hele applikationen ved at ændre nogle få CSS-brugerdefinerede egenskaber for nuance, lyshed og kromaværdier.

## Indholdsstyring

### Hvilke indholdstyper understøttes?

Som standard understøtter [[SITE_NAME]] sider, blogindlæg, portfolioelementer, udvalgte kort, kategorier og tags. Indholdstype-registret er konfigurationsdrevet, så tilføjelse af nye typer kræver minimale kodeændringer.

### Understøtter [[SITE_NAME]] flere sprog?

Ja. [[SITE_NAME]] har indbygget i18n med proxy-rewrite-lokalruting, oversættelsesgrupper til indhold og en oversættelseslinje i administrationspanelet. Tilføj nye lokaler ved at opdatere et enkelt konfigurationsarray.

### Kan jeg bruge en rig teksteditor?

Ja. Administrationspanelet inkluderer en Tiptap-baseret rig teksteditor med understøttelse af overskrifter, lister, billeder, links, kodeblokke og brugerdefinerede kortkoder. Indhold gemmes som Markdown for portabilitet.
