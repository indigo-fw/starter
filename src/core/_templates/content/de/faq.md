---
title: Häufig gestellte Fragen
type: page
description: Häufig gestellte Fragen zu [[SITE_NAME]] — Installation, Anpassung, Inhaltsverwaltung und Bereitstellung.
seoTitle: "FAQ | {sitename}"
noindex: false
---

## Allgemeine Fragen

### Was ist [[SITE_NAME]]?

[[SITE_NAME]] ist ein quelloffenes, KI-agentengesteuertes CMS und SaaS-Starter, basierend auf dem T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Es bietet ein vollständiges Content-Management-System mit SaaS-Grundbausteinen wie Organisationen, Abrechnung und Echtzeit-Benachrichtigungen.

### Für wen ist [[SITE_NAME]] gedacht?

[[SITE_NAME]] richtet sich an Entwickler und Teams, die SaaS-Produkte, Marketing-Websites, Blogs oder andere inhaltsgesteuerte Anwendungen erstellen. Es eignet sich besonders gut für Projekte, die KI-gestützte Entwicklungsworkflows nutzen.

### Ist [[SITE_NAME]] kostenlos nutzbar?

Ja. [[SITE_NAME]] ist quelloffen unter der AGPL-3.0-Lizenz. Sie können es frei für jedes Projekt verwenden. Kommerzielle Lizenzen sind verfügbar, wenn Sie eine proprietäre Bereitstellung ohne die AGPL-Anforderungen benötigen.

## Technische Fragen

### Welchen Tech-Stack verwendet [[SITE_NAME]]?

[[SITE_NAME]] basiert auf Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL und Better Auth. Es unterstützt außerdem Redis für Caching und Ratenbegrenzung, BullMQ für Hintergrundaufgaben und WebSockets für Echtzeit-Funktionen.

### Wie stelle ich [[SITE_NAME]] bereit?

[[SITE_NAME]] kann überall bereitgestellt werden, wo Node.js unterstützt wird. Beliebte Optionen sind Vercel, Railway, Fly.io und jeder VPS mit Docker. Sie benötigen eine PostgreSQL-Datenbank und optional Redis für den vollen Funktionsumfang.

### Kann ich das Design anpassen?

Selbstverständlich. [[SITE_NAME]] verwendet ein OKLCH-Design-Token-System mit Tailwind CSS v4. Sie können die gesamte Anwendung umgestalten, indem Sie einige wenige CSS-Custom-Properties für Farbton, Helligkeit und Chroma ändern.

## Inhaltsverwaltung

### Welche Inhaltstypen werden unterstützt?

Standardmäßig unterstützt [[SITE_NAME]] Seiten, Blogbeiträge, Portfolio-Elemente, Showcase-Karten, Kategorien und Schlagwörter. Die Inhaltstyp-Registry ist konfigurationsgesteuert, sodass das Hinzufügen neuer Typen nur minimale Codeänderungen erfordert.

### Unterstützt [[SITE_NAME]] mehrere Sprachen?

Ja. [[SITE_NAME]] verfügt über integrierte Internationalisierung mit Proxy-Rewrite-Locale-Routing, Übersetzungsgruppen für Inhalte und einer Übersetzungsleiste im Admin-Bereich. Neue Sprachen können durch Aktualisierung eines einzigen Konfigurationsarrays hinzugefügt werden.

### Kann ich einen Rich-Text-Editor verwenden?

Ja. Der Admin-Bereich enthält einen Tiptap-basierten Rich-Text-Editor mit Unterstützung für Überschriften, Listen, Bilder, Links, Codeblöcke und benutzerdefinierte Shortcodes. Inhalte werden als Markdown gespeichert, um die Portabilität zu gewährleisten.
