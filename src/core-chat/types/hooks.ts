declare module '@/core/lib/module/module-hooks' {
  interface HookMap {
    'ws.message': [userId: string, msg: { type?: string; payload?: Record<string, unknown> }];
  }
}
export {};
