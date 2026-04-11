---
title: Veelgestelde vragen
type: page
description: Veelgestelde vragen over %SITE_NAME% — installatie, aanpassing, contentbeheer en deployment.
seoTitle: "Veelgestelde vragen | %SITENAME%"
noindex: false
---

## Algemene vragen

### Wat is %SITE_NAME%?

%SITE_NAME% is een open-source, AI agent-gestuurd CMS en SaaS-starter gebouwd op de T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Het biedt een compleet contentmanagementsysteem met SaaS-bouwstenen zoals organisaties, facturering en real-time meldingen.

### Voor wie is %SITE_NAME% bedoeld?

%SITE_NAME% is ontworpen voor ontwikkelaars en teams die SaaS-producten, marketingwebsites, blogs of andere contentgestuurde applicaties bouwen. Het is bijzonder geschikt voor projecten die gebruikmaken van AI-ondersteunde ontwikkelworkflows.

### Is %SITE_NAME% gratis te gebruiken?

Ja. %SITE_NAME% is open source onder de AGPL-3.0-licentie. U kunt het vrij gebruiken voor elk project. Commerciële licenties zijn beschikbaar als u een eigen deployment nodig hebt zonder de AGPL-vereisten.

## Technische vragen

### Welke technologiestack gebruikt %SITE_NAME%?

%SITE_NAME% is gebouwd met Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL en Better Auth. Het ondersteunt ook Redis voor caching en snelheidsbeperking, BullMQ voor achtergrondtaken en WebSockets voor real-time functionaliteit.

### Hoe implementeer ik %SITE_NAME%?

%SITE_NAME% kan overal worden geïmplementeerd waar Node.js wordt ondersteund. Populaire keuzes zijn Vercel, Railway, Fly.io en elke VPS met Docker. U hebt een PostgreSQL-database nodig en optioneel Redis voor volledige functionaliteit.

### Kan ik het ontwerp aanpassen?

Absoluut. %SITE_NAME% gebruikt een OKLCH-ontwerptokensysteem met Tailwind CSS v4. U kunt de volledige applicatie hernoemen door een paar CSS-variabelen voor tint, helderheid en chroma te wijzigen.

## Contentbeheer

### Welke contenttypes worden ondersteund?

Standaard ondersteunt %SITE_NAME% pagina's, blogberichten, portfolio-items, showcase-kaarten, categorieën en tags. Het contenttyperegister is configuratiegestuurd, waardoor het toevoegen van nieuwe typen minimale codewijzigingen vereist.

### Ondersteunt %SITE_NAME% meerdere talen?

Ja. %SITE_NAME% heeft ingebouwde i18n met proxy-rewrite locale routing, vertaalgroepen voor content en een vertaalbalk in het beheerderspaneel. Voeg nieuwe talen toe door een enkele configuratiereeks bij te werken.

### Kan ik een rich text editor gebruiken?

Ja. Het beheerderspaneel bevat een op Tiptap gebaseerde rich text editor met ondersteuning voor koppen, lijsten, afbeeldingen, links, codeblokken en aangepaste shortcodes. Content wordt opgeslagen als Markdown voor overdraagbaarheid.
