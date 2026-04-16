declare module '@/core/lib/module/module-hooks' {
  interface HookMap {
    'feature.require': [orgId: string, feature: string, currentUsage?: number];
  }
}
export {};
