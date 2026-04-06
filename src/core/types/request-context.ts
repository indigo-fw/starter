export interface RequestContext {
  ip: string;
  userAgent?: string;
  country?: string;
  state?: string;
  timezone?: string;
  referer?: string;
}
