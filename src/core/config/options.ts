// Engine config — interface for option definitions (settings registry)

export interface OptionDefinition {
  key: string;
  label: string;
  description?: string;
  group: string;
  type: 'text' | 'url' | 'number' | 'boolean' | 'textarea' | 'json';
  defaultValue: string | number | boolean;
}
