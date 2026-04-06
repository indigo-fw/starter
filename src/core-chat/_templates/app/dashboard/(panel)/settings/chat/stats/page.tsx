'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { Loader2, MessageCircle, Users, Zap, TrendingUp } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b'];

export default function ChatStatsPage() {
  const __ = useAdminTranslations();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: overview } = trpc.chatAdmin.overview.useQuery();
  const { data: charStats, isLoading: charLoading } = trpc.chatAdmin.characterStats.useQuery({ limit: 10 });
  const { data: userStats, isLoading: userLoading } = trpc.chatAdmin.userStats.useQuery({ limit: 10 });
  const { data: msgOverTime } = trpc.chatAdmin.messagesOverTime.useQuery({ from: thirtyDaysAgo, to: now });

  const kpis = [
    { label: __('Conversations'), value: overview?.totalConversations ?? 0, icon: MessageCircle },
    { label: __('Total Messages'), value: overview?.totalMessages ?? 0, icon: TrendingUp },
    { label: __('Active Users (24h)'), value: overview?.activeUsers24h ?? 0, icon: Users },
    { label: __('Tokens Consumed'), value: overview?.totalTokensUsed ?? 0, icon: Zap },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-(--text-primary)">{__('Chat Analytics')}</h1>
        <p className="text-sm text-(--text-secondary) mt-1">{__('Usage statistics and trends')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-500/10 text-brand-500"><kpi.icon size={18} /></div>
              <div>
                <div className="text-2xl font-bold text-(--text-primary)">{kpi.value.toLocaleString()}</div>
                <div className="text-xs text-(--text-tertiary)">{kpi.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Messages Over Time */}
      <div className="card p-5">
        <h2 className="font-semibold text-(--text-primary) mb-4">{__('Messages (30 days)')}</h2>
        {msgOverTime ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={msgOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-tertiary)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--text-tertiary)" />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#ec4899" fill="#ec4899" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-(--text-tertiary)" size={20} /></div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Popular Characters */}
        <div className="card p-5">
          <h2 className="font-semibold text-(--text-primary) mb-4">{__('Popular Characters')}</h2>
          {charLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-(--text-tertiary)" size={20} /></div>
          ) : !charStats?.length ? (
            <p className="text-sm text-(--text-tertiary) text-center py-4">{__('No data yet')}</p>
          ) : (
            <>
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="text-xs text-(--text-tertiary)">
                    <th className="text-left pb-2">#</th>
                    <th className="text-left pb-2">{__('Character')}</th>
                    <th className="text-right pb-2">{__('Convs')}</th>
                    <th className="text-right pb-2">{__('Msgs')}</th>
                    <th className="text-right pb-2">{__('Avg')}</th>
                  </tr>
                </thead>
                <tbody>
                  {charStats.map((c, i) => (
                    <tr key={c.characterId} className="border-t border-(--border-primary)">
                      <td className="py-2 text-(--text-tertiary)">{i + 1}</td>
                      <td className="py-2 font-medium text-(--text-primary)">{c.characterName}</td>
                      <td className="py-2 text-right text-(--text-secondary)">{c.conversationCount}</td>
                      <td className="py-2 text-right text-(--text-secondary)">{c.totalMessages}</td>
                      <td className="py-2 text-right text-(--text-secondary)">{c.avgMessages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={charStats.slice(0, 5)} dataKey="totalMessages" nameKey="characterName" cx="50%" cy="50%" outerRadius={80}>
                    {charStats.slice(0, 5).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* Most Active Users */}
        <div className="card p-5">
          <h2 className="font-semibold text-(--text-primary) mb-4">{__('Most Active Users')}</h2>
          {userLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-(--text-tertiary)" size={20} /></div>
          ) : !userStats?.length ? (
            <p className="text-sm text-(--text-tertiary) text-center py-4">{__('No data yet')}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-(--text-tertiary)">
                  <th className="text-left pb-2">#</th>
                  <th className="text-left pb-2">{__('User')}</th>
                  <th className="text-right pb-2">{__('Convs')}</th>
                  <th className="text-right pb-2">{__('Msgs')}</th>
                  <th className="text-right pb-2">{__('Tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((u, i) => (
                  <tr key={u.userId} className="border-t border-(--border-primary)">
                    <td className="py-2 text-(--text-tertiary)">{i + 1}</td>
                    <td className="py-2">
                      <div className="font-medium text-(--text-primary)">{u.userName}</div>
                      <div className="text-xs text-(--text-tertiary)">{u.userEmail}</div>
                    </td>
                    <td className="py-2 text-right text-(--text-secondary)">{u.conversationCount}</td>
                    <td className="py-2 text-right text-(--text-secondary)">{u.totalMessages}</td>
                    <td className="py-2 text-right text-(--text-secondary)">{u.totalTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
