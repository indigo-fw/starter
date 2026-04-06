'use client';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { MessageCircle, Users, AlertTriangle, Zap, Bot, Flag, BarChart3, Server } from 'lucide-react';

export default function ChatOverviewPage() {
  const __ = useAdminTranslations();
  const { data: stats } = trpc.chatAdmin.overview.useQuery();

  const kpis = [
    { label: __('Conversations'), value: stats?.totalConversations ?? 0, icon: MessageCircle },
    { label: __('Total Messages'), value: stats?.totalMessages ?? 0, icon: Zap },
    { label: __('Active Users (24h)'), value: stats?.activeUsers24h ?? 0, icon: Users },
    { label: __('Flagged Messages'), value: stats?.flaggedMessages ?? 0, icon: AlertTriangle, warn: (stats?.flaggedMessages ?? 0) > 0 },
  ];

  const links = [
    { href: '/dashboard/settings/chat/characters', label: __('Characters'), desc: __('Manage AI personas'), icon: Bot },
    { href: '/dashboard/settings/chat/conversations', label: __('Conversations'), desc: __('Browse all conversations'), icon: MessageCircle },
    { href: '/dashboard/settings/chat/flagged', label: __('Flagged Messages'), desc: __('Review moderated content'), icon: Flag },
    { href: '/dashboard/settings/chat/providers', label: __('AI Providers'), desc: __('Manage LLM providers'), icon: Server },
    { href: '/dashboard/settings/chat/stats', label: __('Analytics'), desc: __('Usage statistics and charts'), icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary)">{__('Chat')}</h1>
        <p className="text-sm text-(--text-secondary) mt-1">{__('AI character chat management')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${kpi.warn ? 'bg-red-500/10 text-red-500' : 'bg-brand-500/10 text-brand-500'}`}>
                <kpi.icon size={18} />
              </div>
              <div>
                <div className="text-2xl font-bold text-(--text-primary)">{kpi.value.toLocaleString()}</div>
                <div className="text-xs text-(--text-tertiary)">{kpi.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="card p-4 hover:border-brand-500/50 hover:bg-brand-500/5 transition-all"
          >
            <div className="flex items-center gap-3">
              <link.icon size={18} className="text-(--text-tertiary)" />
              <div>
                <h3 className="font-semibold text-(--text-primary) text-sm">{link.label}</h3>
                <p className="text-xs text-(--text-tertiary) mt-0.5">{link.desc}</p>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
