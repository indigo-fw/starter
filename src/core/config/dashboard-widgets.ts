// Engine config — interface for dashboard widget definitions

export interface DashboardWidgetDef {
  id: string;
  label: string;
  colSpan: number;       // 1–12 default column span
  minSpan: number;       // minimum allowed
  maxSpan: number;       // maximum allowed
  defaultVisible: boolean;
}
