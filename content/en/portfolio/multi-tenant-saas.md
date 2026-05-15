—————---
title: Multi-Tenant SaaS Architecture
description: How Indigo handles multi-tenancy — org model, data isolation, per-org billing, and custom domains — all built into the starter.
date: 2026-03-01
tags: [architecture, multi-tenant, orgs]
---

# Multi-Tenant SaaS Architecture

Most SaaS starters treat multi-tenancy as an afterthought. Indigo ships it on day one.

## The Org Model

Every user belongs to one or more organizations. Resources — content, media, settings, billing — are scoped to the org, not the user. Inviting a teammate, switching orgs, and managing per-org roles all work out of the box.

## Data Isolation

Each org's data is filtered at the query layer via Drizzle ORM. There's no separate schema per tenant — a single PostgreSQL database with consistent `orgId` foreign keys keeps things simple to operate while staying safe. The `core-multisite` module adds PostgreSQL schema-per-site isolation for stricter requirements.

## Per-Org Billing

The `core-subscriptions` module ties Stripe subscriptions to orgs. Each org has its own plan, token balance, and billing portal. Usage metering flows through the same org boundary, so you can charge per seat, per API call, or per token without custom plumbing.

## Custom Domains

The `core-multisite` module maps custom domains to orgs at the Caddy/Traefik layer. A tenant points their DNS at your VPS; Indigo provisions TLS and routes requests to the right org automatically.

## Why It Matters

Building multi-tenancy after the fact requires rewriting every query and every permission check. Indigo starts there so you don't have to.
