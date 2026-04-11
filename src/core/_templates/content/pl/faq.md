---
title: Najczęściej zadawane pytania
type: page
description: Najczęściej zadawane pytania dotyczące %SITE_NAME% — instalacja, dostosowywanie, zarządzanie treścią i wdrażanie.
seoTitle: "FAQ | %SITENAME%"
noindex: false
---

## Pytania ogólne

### Czym jest %SITE_NAME%?

%SITE_NAME% to otwartoźródłowy, sterowany przez agentów AI system CMS i starter SaaS zbudowany na T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Zapewnia kompletny system zarządzania treścią z elementami SaaS, takimi jak organizacje, fakturowanie i powiadomienia w czasie rzeczywistym.

### Dla kogo jest %SITE_NAME%?

%SITE_NAME% jest przeznaczony dla programistów i zespołów tworzących produkty SaaS, strony marketingowe, blogi lub dowolne aplikacje oparte na treści. Jest szczególnie odpowiedni dla projektów wykorzystujących przepływy pracy wspomagane przez sztuczną inteligencję.

### Czy %SITE_NAME% jest darmowy?

Tak. %SITE_NAME% jest oprogramowaniem open source na licencji AGPL-3.0. Można go swobodnie używać w dowolnym projekcie. Licencje komercyjne są dostępne, jeśli potrzebne jest wdrożenie własnościowe bez wymogów AGPL.

## Pytania techniczne

### Jaki stack technologiczny wykorzystuje %SITE_NAME%?

%SITE_NAME% jest zbudowany z wykorzystaniem Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL i Better Auth. Obsługuje również Redis do buforowania i ograniczania częstotliwości żądań, BullMQ do zadań w tle oraz WebSockety do funkcji czasu rzeczywistego.

### Jak wdrożyć %SITE_NAME%?

%SITE_NAME% można wdrożyć wszędzie tam, gdzie obsługiwany jest Node.js. Popularne opcje to Vercel, Railway, Fly.io oraz dowolny VPS z Dockerem. Wymagana jest baza danych PostgreSQL, a opcjonalnie Redis dla pełnej funkcjonalności.

### Czy mogę dostosować wygląd?

Oczywiście. %SITE_NAME% wykorzystuje system tokenów projektowych OKLCH z Tailwind CSS v4. Można zmienić wygląd całej aplikacji, modyfikując kilka zmiennych CSS odpowiedzialnych za odcień, jasność i nasycenie.

## Zarządzanie treścią

### Jakie typy treści są obsługiwane?

Standardowo %SITE_NAME% obsługuje strony, wpisy na blogu, elementy portfolio, karty prezentacji, kategorie i tagi. Rejestr typów treści jest oparty na konfiguracji, więc dodawanie nowych typów wymaga minimalnych zmian w kodzie.

### Czy %SITE_NAME% obsługuje wiele języków?

Tak. %SITE_NAME% ma wbudowaną obsługę i18n z routingiem lokalizacji proxy-rewrite, grupami tłumaczeń dla treści oraz paskiem tłumaczeń w panelu administracyjnym. Nowe lokalizacje można dodać, aktualizując pojedynczą tablicę konfiguracyjną.

### Czy mogę korzystać z edytora tekstu sformatowanego?

Tak. Panel administracyjny zawiera edytor tekstu sformatowanego oparty na Tiptap z obsługą nagłówków, list, obrazów, linków, bloków kodu i niestandardowych shortcodów. Treść jest przechowywana w formacie Markdown dla zapewnienia przenośności.
