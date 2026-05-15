---
title: Deploy to a €4/Month VPS
description: How to go from zero to a production Indigo instance on a Hetzner CX22 — Docker Compose, Caddy TLS, GitHub Actions CI/CD — for about €46 per year.
date: 2026-01-20
tags: [deployment, vps, docker, ci-cd]
---

# Deploy to a €4/Month VPS

Indigo is designed to run comfortably on a small VPS. This is how the demo instance at demo.indigo-fw.dev is hosted.

## The Stack

- Hetzner CX22: 2 vCPU, 4 GB RAM, 40 GB SSD, Falkenstein — €3.79/month
- Ubuntu 24.04 + Docker Compose (app, postgres, redis, caddy)
- Caddy handles TLS automatically via Let's Encrypt
- Cloudflare in front for DDoS protection, caching, and WAF

## The CI/CD Pipeline

Every push to main triggers a GitHub Actions workflow that builds the Docker image, pushes it to GitHub Container Registry (GHCR), then SSHes into the VPS to pull and restart. The build runs on GitHub's free runners — the VPS never wastes RAM on Next.js builds.

## Cost Breakdown

| Item | Annual cost |
|---|---|
| Hetzner CX22 | €46 |
| .dev domain (Cloudflare Registrar) | ~$11 |
| Cloudflare DNS/CDN/WAF | $0 |
| GitHub Actions (public repo) | $0 |
| Resend (3K emails/mo) | $0 |
| Total | ~$65/year |

## Getting Started

See docs/en/guides/02-deployment.mdx in the repo for the full step-by-step guide. The short version: provision the VPS, run bun run init on the server, add DEMO_HOST and DEPLOY_SSH_KEY as GitHub secrets, and push to main.
