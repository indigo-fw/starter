---
title: Vanliga frågor
type: page
description: Vanliga frågor om [[SITE_NAME]] — installation, anpassning, innehållshantering och driftsättning.
seoTitle: "FAQ | [[SITE_NAME]]"
noindex: false
---

## Allmänna frågor

### Vad är [[SITE_NAME]]?

[[SITE_NAME]] är en AI-agentdriven CMS- och SaaS-starter med öppen källkod, byggd på T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Den tillhandahåller ett komplett innehållshanteringssystem med SaaS-primitiver som organisationer, fakturering och realtidsaviseringar.

### Vem är [[SITE_NAME]] till för?

[[SITE_NAME]] är utformat för utvecklare och team som bygger SaaS-produkter, marknadsföringssajter, bloggar eller andra innehållsdrivna applikationer. Det är särskilt väl lämpat för projekt som utnyttjar AI-assisterade utvecklingsarbetsflöden.

### Är [[SITE_NAME]] gratis att använda?

Ja. [[SITE_NAME]] är öppen källkod under AGPL-3.0-licensen. Du kan använda det fritt för alla projekt. Kommersiella licenser finns tillgängliga om du behöver proprietär driftsättning utan AGPL-kraven.

## Tekniska frågor

### Vilken teknikstack använder [[SITE_NAME]]?

[[SITE_NAME]] är byggt med Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL och Better Auth. Det stöder även Redis för caching och hastighetsbegränsning, BullMQ för bakgrundsjobb och WebSockets för realtidsfunktioner.

### Hur driftsätter jag [[SITE_NAME]]?

[[SITE_NAME]] kan driftsättas var som helst som stöder Node.js. Populära val inkluderar Vercel, Railway, Fly.io och vilken VPS som helst med Docker. Du behöver en PostgreSQL-databas och valfritt Redis för full funktionalitet.

### Kan jag anpassa designen?

Absolut. [[SITE_NAME]] använder ett OKLCH-designtokensystem med Tailwind CSS v4. Du kan ändra hela applikationens varumärke genom att ändra några CSS-anpassade egenskaper för nyans, ljushet och kromavärden.

## Innehållshantering

### Vilka innehållstyper stöds?

Som standard stöder [[SITE_NAME]] sidor, blogginlägg, portfolioobjekt, utvalda kort, kategorier och taggar. Innehållstypregistret är konfigurationsdrivet, så att lägga till nya typer kräver minimala kodändringar.

### Stöder [[SITE_NAME]] flera språk?

Ja. [[SITE_NAME]] har inbyggd i18n med proxy-rewrite-lokalruttning, översättningsgrupper för innehåll och ett översättningsfält i adminpanelen. Lägg till nya lokaler genom att uppdatera en enda konfigurationsarray.

### Kan jag använda en rik textredigerare?

Ja. Adminpanelen innehåller en Tiptap-baserad rik textredigerare med stöd för rubriker, listor, bilder, länkar, kodblock och anpassade kortkoder. Innehåll lagras som Markdown för portabilitet.
