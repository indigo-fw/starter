---
title: B2B Analytics Dashboard
description: An embedded analytics SaaS built on Indigo — org-scoped data, API key access, usage metering, and a white-label dashboard for end customers.
date: 2026-04-01
tags: [b2b, analytics, saas, api]
---

# B2B Analytics Dashboard

A B2B SaaS that lets customers embed analytics into their own products — scoped to their org, accessed via API keys, billed by event volume.

## The Problem It Solves

Most analytics tools are monolithic. This product lets each customer bring their own data via API, view it in a white-label dashboard, and embed charts into their own app via iframe or SDK — all multi-tenant from day one.

## Modules Used

- core-api: per-org REST API v2 with key management, scopes, and usage metering
- core-subscriptions: event-volume billing tiers with Stripe
- core-multisite: schema-per-org isolation for strict data separation

## Architecture Decisions

API keys are issued per org with read/write/admin scopes. Each ingest request is metered and counted against the org's monthly quota. Overages trigger automatic Stripe billing via the subscription module's metering hooks.

The dashboard renders charts from the org's own data, isolated at the PostgreSQL schema level. No cross-org data leakage is possible — each org's tables live in their own schema.

## What Was Custom

The ingest pipeline (webhook receiver, event normalization, time-series aggregation) and the chart rendering layer (Recharts + tRPC subscriptions for real-time updates). Everything else — auth, org management, billing, API keys, admin — came from Indigo.
