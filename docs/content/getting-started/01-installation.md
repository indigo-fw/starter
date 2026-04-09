---
title: Installation
section: Getting Started
order: 1
description: How to install and set up Indigo for a new project
---

# Installation

## Prerequisites

- [Bun](https://bun.sh) v1.1+ (package manager and runtime)
- [PostgreSQL](https://www.postgresql.org/) 15+ with a running instance
- [Git](https://git-scm.com/)

## Quick Start

Clone the starter template and install dependencies:

```bash
git clone https://github.com/indigo-fw/starter my-project
cd my-project
bun install
```

Copy the example environment file and configure your database:

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/myproject
BETTER_AUTH_SECRET=your-secret-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME=My Project
```

## Initialize the Database

Run the init script to create the database, run migrations, create a superadmin account, and seed default content:

```bash
bun run init
```

This will prompt you for a superadmin email and password.

## Start Development

```bash
bun run dev
```

Your app is now running at [http://localhost:3000](http://localhost:3000). The admin dashboard is at [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Next Steps

- [Configuration](/docs/getting-started/configuration) — customize your project settings
- [Modules](/docs/guides/modules) — install premium features
- [Deployment](/docs/guides/deployment) — deploy to production
