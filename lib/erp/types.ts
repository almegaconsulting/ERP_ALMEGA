export const entityNames = ['clients', 'contacts', 'opportunities', 'consultants', 'projects', 'contracts', 'purchase_orders', 'timesheets', 'invoices', 'expenses'] as const;
export type Entity = typeof entityNames[number];
export type Role = 'owner' | 'admin' | 'manager' | 'viewer';
export type FieldValue = string | number | null;
export type EntityRecord = { id: string; company_id: string; created_at: string; updated_at: string; [key: string]: FieldValue };
export type RecordInput = Record<string, FieldValue>;
export type Dataset = Record<Entity, EntityRecord[]>;
export type Company = {
  id: string; name: string; legal_name: string; tax_id: string; country_code: string;
  currency_code: string; locale: string; created_at: string;
};
export type Member = { user_id: string; company_id: string; role: Role; email: string };
export type Field = {
  key: string; label: string; type: 'text' | 'email' | 'date' | 'number' | 'money' | 'select' | 'textarea' | 'reference';
  required?: boolean; options?: readonly { value: string; label: string }[]; entity?: Entity;
  min?: number; max?: number; step?: number; default?: FieldValue; readOnly?: boolean;
};
export type EntitySpec = {
  label: string; singular: string; description: string; titleField: string; statusField: string;
  fields: readonly Field[]; columns: readonly string[];
};
export type AppState = { companies: Company[]; activeCompanyId: string; records: Dataset };
export const emptyDataset = (): Dataset => ({ clients: [], contacts: [], opportunities: [], consultants: [], projects: [], contracts: [], purchase_orders: [], timesheets: [], invoices: [], expenses: [] });
export const canWrite = (role: Role) => role !== 'viewer';
export const canAdmin = (role: Role) => role === 'owner' || role === 'admin';
export const isEntity = (value: string): value is Entity => (entityNames as readonly string[]).includes(value);
