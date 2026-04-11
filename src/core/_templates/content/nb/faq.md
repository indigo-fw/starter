---
title: Ofte stilte spørsmål
type: page
description: Ofte stilte spørsmål om %SITE_NAME% — installasjon, tilpasning, innholdshåndtering og utrulling.
seoTitle: "FAQ | %SITENAME%"
noindex: false
---

## Generelle spørsmål

### Hva er %SITE_NAME%?

%SITE_NAME% er en AI-agentdrevet CMS- og SaaS-starter med åpen kildekode, bygget på T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Den tilbyr et komplett innholdshåndteringssystem med SaaS-primitiver som organisasjoner, fakturering og sanntidsvarsler.

### Hvem er %SITE_NAME% for?

%SITE_NAME% er designet for utviklere og team som bygger SaaS-produkter, markedsføringssider, blogger eller andre innholdsdrevne applikasjoner. Det er spesielt godt egnet for prosjekter som utnytter AI-assisterte utviklingsarbeidsflyter.

### Er %SITE_NAME% gratis å bruke?

Ja. %SITE_NAME% er åpen kildekode under AGPL-3.0-lisensen. Du kan bruke det fritt til ethvert prosjekt. Kommersielle lisenser er tilgjengelige hvis du trenger proprietær utrulling uten AGPL-kravene.

## Tekniske spørsmål

### Hvilken teknologistack bruker %SITE_NAME%?

%SITE_NAME% er bygget med Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL og Better Auth. Det støtter også Redis for hurtigbuffer og hastighetsbegrensning, BullMQ for bakgrunnsjobber og WebSockets for sanntidsfunksjoner.

### Hvordan ruller jeg ut %SITE_NAME%?

%SITE_NAME% kan rulles ut overalt hvor Node.js støttes. Populære valg inkluderer Vercel, Railway, Fly.io og enhver VPS med Docker. Du trenger en PostgreSQL-database og eventuelt Redis for full funksjonalitet.

### Kan jeg tilpasse designet?

Absolutt. %SITE_NAME% bruker et OKLCH-designtokensystem med Tailwind CSS v4. Du kan endre hele applikasjonens merkevare ved å endre noen få CSS-egendefinerte egenskaper for nyanse, lyshet og kromaverdier.

## Innholdshåndtering

### Hvilke innholdstyper støttes?

Som standard støtter %SITE_NAME% sider, blogginnlegg, porteføljeelementer, utvalgte kort, kategorier og tagger. Innholdstyperegisteret er konfigurasjonsdrevet, så å legge til nye typer krever minimale kodeendringer.

### Støtter %SITE_NAME% flere språk?

Ja. %SITE_NAME% har innebygd i18n med proxy-rewrite-lokalruting, oversettelsesgrupper for innhold og en oversettelseslinje i administrasjonspanelet. Legg til nye lokaler ved å oppdatere en enkelt konfigurasjonsarray.

### Kan jeg bruke en rik tekstredigerer?

Ja. Administrasjonspanelet inkluderer en Tiptap-basert rik tekstredigerer med støtte for overskrifter, lister, bilder, lenker, kodeblokker og egendefinerte kortkoder. Innhold lagres som Markdown for portabilitet.
