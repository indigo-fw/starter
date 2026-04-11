---
title: Foire aux questions
type: page
description: Questions fréquemment posées sur [[SITE_NAME]] — installation, personnalisation, gestion de contenu et déploiement.
seoTitle: "FAQ | {sitename}"
noindex: false
---

## Questions générales

### Qu'est-ce que [[SITE_NAME]] ?

[[SITE_NAME]] est un CMS et starter SaaS open source piloté par agents IA, construit sur le T3 Stack (Next.js, tRPC, Drizzle ORM, Better Auth). Il fournit un système de gestion de contenu complet avec des primitives SaaS telles que les organisations, la facturation et les notifications en temps réel.

### À qui s'adresse [[SITE_NAME]] ?

[[SITE_NAME]] est conçu pour les développeurs et les équipes qui créent des produits SaaS, des sites marketing, des blogs ou toute application orientée contenu. Il est particulièrement adapté aux projets qui tirent parti des flux de travail de développement assisté par IA.

### [[SITE_NAME]] est-il gratuit ?

Oui. [[SITE_NAME]] est open source sous licence AGPL-3.0. Vous pouvez l'utiliser librement pour tout projet. Des licences commerciales sont disponibles si vous avez besoin d'un déploiement propriétaire sans les exigences de l'AGPL.

## Questions techniques

### Quel stack technique utilise [[SITE_NAME]] ?

[[SITE_NAME]] est construit avec Next.js 16 (App Router), TypeScript, Tailwind CSS v4, tRPC, Drizzle ORM, PostgreSQL et Better Auth. Il prend également en charge Redis pour la mise en cache et la limitation de débit, BullMQ pour les tâches en arrière-plan et les WebSockets pour les fonctionnalités temps réel.

### Comment déployer [[SITE_NAME]] ?

[[SITE_NAME]] peut être déployé partout où Node.js est pris en charge. Les choix populaires incluent Vercel, Railway, Fly.io et tout VPS avec Docker. Vous aurez besoin d'une base de données PostgreSQL et éventuellement de Redis pour bénéficier de toutes les fonctionnalités.

### Puis-je personnaliser le design ?

Absolument. [[SITE_NAME]] utilise un système de tokens de design OKLCH avec Tailwind CSS v4. Vous pouvez changer l'identité visuelle de l'ensemble de l'application en modifiant quelques propriétés personnalisées CSS pour les valeurs de teinte, luminosité et saturation.

## Gestion de contenu

### Quels types de contenu sont pris en charge ?

Par défaut, [[SITE_NAME]] prend en charge les pages, les articles de blog, les éléments de portfolio, les cartes vitrine, les catégories et les étiquettes. Le registre des types de contenu est piloté par la configuration, de sorte que l'ajout de nouveaux types nécessite un minimum de modifications du code.

### [[SITE_NAME]] prend-il en charge plusieurs langues ?

Oui. [[SITE_NAME]] dispose d'une internationalisation intégrée avec routage de locale par proxy-rewrite, groupes de traduction pour le contenu et une barre de traduction dans le panneau d'administration. Ajoutez de nouvelles langues en mettant à jour un seul tableau de configuration.

### Puis-je utiliser un éditeur de texte enrichi ?

Oui. Le panneau d'administration inclut un éditeur de texte enrichi basé sur Tiptap avec prise en charge des titres, listes, images, liens, blocs de code et shortcodes personnalisés. Le contenu est stocké au format Markdown pour garantir la portabilité.
