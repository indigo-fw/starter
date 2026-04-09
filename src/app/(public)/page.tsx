import type { Metadata } from "next";
import NextLink from "next/link";
import {
  MessageCircle,
  LayoutDashboard,
  Users,
  CreditCard,
  Bot,
  Image,
  Mic,
  Shield,
  BarChart3,
  Settings,
  FileText,
  Palette,
  ArrowRight,
  ExternalLink,
  BookOpen,
  Lock,
} from "lucide-react";

import { siteConfig } from "@/config/site";
import { db } from "@/server/db";
import { getCodedRouteSEO } from "@/core/crud/page-seo";
import { getCmsOverride } from "@/lib/cms-override";
import { CmsContent } from "@/core/components";
import { SHORTCODE_COMPONENTS } from "@/config/shortcodes";
import { getLocale } from "@/lib/locale-server";
import { getServerTranslations } from "@/lib/translations-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const seo = await getCodedRouteSEO(db, "", locale).catch(() => null);
  return {
    title: seo?.seoTitle || `${siteConfig.name} — Demo`,
    description: seo?.metaDescription || siteConfig.seo.description,
    ...(seo?.noindex && { robots: { index: false, follow: false } }),
  };
}

const DEMO_CREDENTIALS = { email: "admin@example.com", password: "asdfasdf" };

export default async function DemoHomePage() {
  const locale = await getLocale();
  const __ = await getServerTranslations();
  const cms = await getCmsOverride(db, "", locale).catch(() => null);

  const features = [
    {
      icon: Bot,
      title: __("Browse Characters"),
      description: __("30 AI characters with filters, pagination, and video hover."),
      href: "/characters",
    },
    {
      icon: MessageCircle,
      title: __("AI Chat"),
      description: __("Real-time text chat with LLM streaming and typing animation."),
      href: "/chat",
      badge: "WebSocket",
    },
    {
      icon: Image,
      title: __("Image Generation"),
      description: __('Full keyword orchestration — type "send me a photo" in chat.'),
      href: "/chat",
    },
    {
      icon: Mic,
      title: __("Voice Calls"),
      description: __("Call AI characters — STT → LLM → TTS with per-minute billing."),
      href: "/chat",
      badge: "New",
    },
    {
      icon: LayoutDashboard,
      title: __("Admin Dashboard"),
      description: __("Content, users, settings, analytics, provider management."),
      href: "/dashboard",
    },
    {
      icon: FileText,
      title: __("CMS"),
      description: __("Blog, pages, portfolio, categories, tags — config-driven."),
      href: "/blog",
    },
    {
      icon: CreditCard,
      title: __("Billing & Tokens"),
      description: __("Stripe subscriptions, token balance, discount codes."),
      href: "/account/billing",
    },
    {
      icon: Users,
      title: __("Organizations"),
      description: __("Multi-tenant with roles for billing scoping."),
      href: "/account",
    },
    {
      icon: Shield,
      title: __("Moderation"),
      description: __("Keyword filter + audit log + auto-block."),
      href: "/dashboard/settings/chat/flagged",
    },
    {
      icon: BarChart3,
      title: __("Analytics"),
      description: __("Character stats, user activity, provider health."),
      href: "/dashboard/settings/chat/stats",
    },
    {
      icon: Settings,
      title: __("AI Providers"),
      description: __("DB-stored with encryption, round-robin, fallback."),
      href: "/dashboard/settings/chat/providers",
    },
    {
      icon: Palette,
      title: __("Theme & Branding"),
      description: __("OKLCH design tokens, dark mode, CSS variables."),
      href: "/dashboard/settings",
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div className="app-container text-center relative z-10">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand-500/10 text-brand-500 mb-6">
            {__("Live Demo — resets hourly")}
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-(--text-primary) max-w-3xl mx-auto leading-tight">
            {siteConfig.name}
          </h1>

          <p className="mt-4 text-lg text-(--text-secondary) max-w-2xl mx-auto">
            {__(
              "The complete SaaS framework for Next.js — CMS, billing, auth, real-time, AI chat, and modular architecture.",
            )}
          </p>

          {/* Demo credentials */}
          <div className="mt-8 inline-flex items-center gap-4 px-6 py-3 rounded-xl bg-(--surface-secondary) border border-(--border-primary)">
            <Lock size={16} className="text-(--text-tertiary)" />
            <div className="text-left">
              <div className="text-xs text-(--text-tertiary)">
                {__("Demo login")}
              </div>
              <div className="text-sm font-mono text-(--text-primary)">
                {DEMO_CREDENTIALS.email} / {DEMO_CREDENTIALS.password}
              </div>
            </div>
            <NextLink
              href="/dashboard/login"
              className="btn btn-primary rounded-lg px-4 py-2 text-xs font-semibold"
            >
              {__("Log in")} →
            </NextLink>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <NextLink
              href="/characters"
              className="btn btn-primary rounded-xl px-6 py-3 text-sm font-semibold shadow-lg shadow-brand-500/20"
            >
              {__("Browse Characters")}
            </NextLink>
            <NextLink
              href="/dashboard"
              className="btn btn-secondary rounded-xl px-6 py-3 text-sm font-semibold"
            >
              {__("Admin Dashboard")}
            </NextLink>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-16 app-section-alt">
        <div className="app-container">
          <h2 className="text-2xl font-bold text-(--text-primary) text-center mb-3">
            {__("Explore the Features")}
          </h2>
          <p className="text-sm text-(--text-secondary) text-center mb-12 max-w-lg mx-auto">
            {__(
              "Click any card to see it in action. Everything is live and functional.",
            )}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {features.map((f) => (
              <NextLink
                key={f.href + f.title}
                href={f.href}
                className="group relative p-5 rounded-xl border border-(--border-primary) bg-(--surface-primary) hover:border-brand-500/30 hover:shadow-lg hover:shadow-brand-500/5 transition-all"
              >
                {f.badge && (
                  <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-500/10 text-brand-500">
                    {f.badge}
                  </span>
                )}
                <div className="w-9 h-9 rounded-lg bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                  <f.icon size={18} />
                </div>
                <h3 className="font-semibold text-sm text-(--text-primary)">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-xs text-(--text-secondary) leading-relaxed">
                  {f.description}
                </p>
                <div className="mt-3 flex items-center gap-1 text-xs text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>{__("Explore")}</span>
                  <ArrowRight size={12} />
                </div>
              </NextLink>
            ))}
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="py-16">
        <div className="app-container">
          <h2 className="text-2xl font-bold text-(--text-primary) text-center mb-10">
            {__("Built With")}
          </h2>
          <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
            {[
              "Next.js 16",
              "React 19",
              "TypeScript",
              "tRPC",
              "Drizzle ORM",
              "PostgreSQL",
              "Better Auth",
              "Tailwind CSS v4",
              "WebSocket",
              "BullMQ",
              "Redis",
              "Stripe",
              "Bun",
              "Zod",
            ].map((tech) => (
              <span
                key={tech}
                className="px-3 py-1.5 rounded-lg bg-(--surface-secondary) border border-(--border-primary) text-xs font-medium text-(--text-secondary)"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="py-16 app-section-alt">
        <div className="app-container max-w-3xl">
          <h2 className="text-2xl font-bold text-(--text-primary) text-center mb-3">
            {__("Modular Architecture")}
          </h2>
          <p className="text-sm text-(--text-secondary) text-center mb-8">
            {__(
              "Install only what you need. Each module is a self-contained git subtree.",
            )}
          </p>
          <div className="space-y-2">
            {[
              {
                name: "core-chat",
                desc: "AI character chat, image/video gen, voice calls",
                free: false,
              },
              {
                name: "core-billing",
                desc: "Stripe subscriptions, tokens, discounts",
                free: true,
              },
              {
                name: "core-support",
                desc: "AI support chat + ticket system",
                free: false,
              },
              { name: "core-docs", desc: "Documentation system", free: true },
              {
                name: "core-store",
                desc: "E-commerce (products, cart, checkout)",
                free: false,
              },
              {
                name: "core-affiliates",
                desc: "Referral tracking, commissions",
                free: false,
              },
            ].map((mod) => (
              <div
                key={mod.name}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-(--border-primary) bg-(--surface-primary)"
              >
                <code className="text-xs font-mono text-brand-500 min-w-[140px]">
                  {mod.name}
                </code>
                <span className="text-xs text-(--text-secondary) flex-1">
                  {mod.desc}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${mod.free ? "bg-green-500/10 text-green-500" : "bg-(--surface-secondary) text-(--text-tertiary)"}`}
                >
                  {mod.free ? "Free" : "Premium"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-center mt-6">
            <code className="text-xs text-(--text-tertiary)">
              bun run indigo add core-chat
            </code>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="app-container text-center">
          <h2 className="text-2xl font-bold text-(--text-primary)">
            {__("Ready to build?")}
          </h2>
          <p className="mt-2 text-sm text-(--text-secondary)">
            {__("Clone, init, ship. It's that simple.")}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/indigo-fw/starter"
              className="btn btn-primary rounded-xl px-6 py-3 text-sm font-semibold inline-flex items-center gap-2 shadow-lg shadow-brand-500/20"
            >
              <ExternalLink size={16} /> {__("Clone on GitHub")}
            </a>
            <a
              href="https://indigo-fw.com/docs"
              className="btn btn-secondary rounded-xl px-6 py-3 text-sm font-semibold inline-flex items-center gap-2"
            >
              <BookOpen size={16} /> {__("Documentation")}
            </a>
          </div>
          <p className="mt-8 text-xs text-(--text-tertiary)">
            {__("Dual-licensed: AGPL-3.0 (open source) or Commercial License")}
          </p>
        </div>
      </section>

      {cms?.content && (
        <CmsContent content={cms.content} components={SHORTCODE_COMPONENTS} />
      )}
    </div>
  );
}
