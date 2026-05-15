---
title: Community Platform
description: A SaaS community platform built on Indigo — user profiles, orgs, subscriptions, real-time chat, and AI support, all in one starter.
date: 2026-03-20
tags: [community, saas, real-time, ai]
---

# Community Platform

A full community SaaS — user profiles, org workspaces, subscription tiers, threaded comments, real-time notifications, and AI-powered support chat — assembled from Indigo modules.

## Modules Used

- core-subscriptions: tiered membership plans (free, pro, team)
- core-support: AI chat widget with ticket escalation
- core-comments: threaded discussions on any content type
- core-activity: per-user activity feed and timeline
- core-affiliates: referral program for viral growth

## What Came for Free

Auth, org management, role-based access, email transactional flows, CMS for documentation and announcements, media uploads, i18n, and the admin dashboard — all from the Indigo base.

## What Was Built on Top

Custom member directory, reputation scoring, and community badges — roughly 400 lines of product-specific code on top of the framework.

## Stack

Next.js 16 App Router, tRPC, Drizzle ORM, PostgreSQL, Redis, BullMQ workers for notifications. Deployed on a Hetzner CX32 (4 vCPU / 8 GB) — $12/month for ~5,000 active members.
