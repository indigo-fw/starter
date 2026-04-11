---
title: Preguntas frecuentes
type: page
description: Preguntas frecuentes sobre [[SITE_NAME]] — instalación, personalización, gestión de contenidos y despliegue.
seoTitle: "FAQ | [[SITE_NAME]]"
noindex: false
---

## Preguntas generales

### ¿Qué es [[SITE_NAME]]?

[[SITE_NAME]] es un CMS y starter SaaS de código abierto impulsado por agentes de IA, construido sobre el T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Proporciona un sistema de gestión de contenidos completo con primitivas SaaS como organizaciones, facturación y notificaciones en tiempo real.

### ¿Para quién está diseñado [[SITE_NAME]]?

[[SITE_NAME]] está diseñado para desarrolladores y equipos que crean productos SaaS, sitios de marketing, blogs o cualquier aplicación basada en contenido. Es especialmente adecuado para proyectos que aprovechan flujos de trabajo de desarrollo asistido por IA.

### ¿Es [[SITE_NAME]] gratuito?

Sí. [[SITE_NAME]] es de código abierto bajo la licencia AGPL-3.0. Puede utilizarlo libremente para cualquier proyecto. Se ofrecen licencias comerciales si necesita un despliegue propietario sin los requisitos de la AGPL.

## Preguntas técnicas

### ¿Qué stack tecnológico utiliza [[SITE_NAME]]?

[[SITE_NAME]] está construido con Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL y Better Auth. También es compatible con Redis para caché y limitación de tasa, BullMQ para tareas en segundo plano y WebSockets para funciones en tiempo real.

### ¿Cómo despliego [[SITE_NAME]]?

[[SITE_NAME]] puede desplegarse en cualquier lugar que soporte Node.js. Las opciones populares incluyen Vercel, Railway, Fly.io y cualquier VPS con Docker. Necesitará una base de datos PostgreSQL y opcionalmente Redis para la funcionalidad completa.

### ¿Puedo personalizar el diseño?

Por supuesto. [[SITE_NAME]] utiliza un sistema de tokens de diseño OKLCH con Tailwind CSS v4. Puede cambiar la marca de toda la aplicación modificando unas pocas propiedades personalizadas de CSS para los valores de tono, luminosidad y croma.

## Gestión de contenidos

### ¿Qué tipos de contenido se admiten?

De forma predeterminada, [[SITE_NAME]] admite páginas, publicaciones de blog, elementos de portafolio, tarjetas de escaparate, categorías y etiquetas. El registro de tipos de contenido está basado en configuración, por lo que agregar nuevos tipos requiere cambios mínimos en el código.

### ¿[[SITE_NAME]] admite varios idiomas?

Sí. [[SITE_NAME]] cuenta con internacionalización integrada con enrutamiento de localización por proxy-rewrite, grupos de traducción para contenido y una barra de traducción en el panel de administración. Agregue nuevos idiomas actualizando un único array de configuración.

### ¿Puedo usar un editor de texto enriquecido?

Sí. El panel de administración incluye un editor de texto enriquecido basado en Tiptap con soporte para encabezados, listas, imágenes, enlaces, bloques de código y shortcodes personalizados. El contenido se almacena como Markdown para garantizar la portabilidad.
