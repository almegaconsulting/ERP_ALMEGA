import { countries, currencies, specs } from './config';
import { entityNames, type Company, type Dataset, type Entity, type EntityRecord, type RecordInput, type FieldValue } from './types';

export const MONEY_LIMIT = 1_000_000_000_000;
export const minorDigits = (currency: string) => ['JPY', 'CLP'].includes(currency) ? 0 : 2;
export function fromMinor(value: number, currency = 'EUR'): number { return value / (10 ** minorDigits(currency)); }
export function formatMoney(value: number, currency = 'EUR', locale = 'es-ES'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(fromMinor(value, currency));
}
export function toMinor(value: string | number, currency = 'EUR'): number {
  const text = String(value).trim().replace(',', '.');
  const digits = minorDigits(currency);
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('Introduce un importe positivo válido.');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) throw new Error(`Esta moneda admite ${digits} decimales.`);
  const minor = BigInt(whole) * (10n ** BigInt(digits)) + BigInt((fraction.slice(0, digits).padEnd(digits, '0')) || '0');
  if (minor > BigInt(MONEY_LIMIT)) throw new Error('El importe supera el máximo admitido.');
  return Number(minor);
}
export function invoiceTotals(subtotal: number, rate: number) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > MONEY_LIMIT || !Number.isFinite(rate) || rate < 0 || rate > 100 || Math.abs(rate * 100 - Math.round(rate * 100)) > 1e-7) throw new Error('Base imponible o impuesto no válidos.');
  const tax = Number((BigInt(subtotal) * BigInt(Math.round(rate * 100)) + 5000n) / 10000n);
  return { subtotal_minor: subtotal, tax_minor: tax, total_minor: subtotal + tax };
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const string = (v: FieldValue | undefined) => v == null ? '' : String(v);
const number = (v: FieldValue | undefined) => Number(v ?? 0);
export function companyInput(input: RecordInput): Omit<Company, 'id' | 'created_at'> {
  const name = string(input.name).trim();
  if (!name || name.length > 160) throw new Error('Indica un nombre de empresa de hasta 160 caracteres.');
  const country = string(input.country_code || 'ES');
  const currency = string(input.currency_code || 'EUR');
  if (!countries.some(c => c.value === country)) throw new Error('Selecciona un país válido.');
  if (!currencies.some(c => c.value === currency)) throw new Error('Selecciona una moneda válida.');
  return { name, legal_name: string(input.legal_name || name).trim().slice(0, 240), tax_id: string(input.tax_id).trim().slice(0, 60), country_code: country, currency_code: currency, locale: 'es-ES' };
}

export function validateRecord(entity: Entity, input: RecordInput, data: Dataset, companyId: string, existing?: EntityRecord): RecordInput {
  const spec = specs[entity];
  const allowed = new Set(spec.fields.map(f => f.key));
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`Campo no editable: ${key}.`);
  const result: RecordInput = {};
  for (const field of spec.fields) {
    const raw = (Object.hasOwn(input, field.key) ? input[field.key] : existing ? existing[field.key] : field.default) ?? null;
    const empty = raw === null || typeof raw === 'string' && !raw.trim();
    if (empty && field.required) throw new Error(`${field.label} es obligatorio.`);
    if (empty) { result[field.key] = null; continue; }
    if (field.type === 'money' || field.type === 'number') {
      if (typeof raw !== 'number' && !/^\d+(?:\.\d+)?$/.test(String(raw))) throw new Error(`${field.label}: introduce un número válido.`);
      const value = Number(raw);
      if (!Number.isFinite(value) || value < (field.min ?? 0) || value > (field.max ?? MONEY_LIMIT)) throw new Error(`${field.label}: importe o rango no válido.`);
      if (field.type === 'money' && !Number.isSafeInteger(value)) throw new Error(`${field.label}: precisión monetaria no válida.`);
      if (field.step && Math.abs(value / field.step - Math.round(value / field.step)) > 1e-6) throw new Error(`${field.label}: usa incrementos de ${field.step}.`);
      result[field.key] = value;
    } else {
      if (typeof raw !== 'string') throw new Error(`${field.label}: formato no válido.`);
      const value = raw.trim();
      const limits: Record<string, number> = { name: 180, full_name: 180, email: 254, phone: 80, tax_id: 80, position: 180, po_number: 100, invoice_number: 100, holded_contact_id: 128 };
      const limit = limits[field.key] ?? (field.type === 'textarea' ? 4000 : 240);
      if (value.length > limit) throw new Error(`${field.label}: admite hasta ${limit} caracteres.`);
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('El correo electrónico no es válido.');
      if (field.type === 'date' && !validDate(value)) throw new Error(`${field.label}: fecha no válida.`);
      if (field.options && !field.options.some(o => o.value === value)) throw new Error(`${field.label}: opción no válida.`);
      if (field.entity && !data[field.entity].some(r => r.id === value && r.company_id === companyId)) throw new Error(`${field.label}: el registro no pertenece a esta empresa.`);
      result[field.key] = value;
    }
  }
  if (existing && existing.company_id !== companyId) throw new Error('El registro no pertenece a esta empresa.');
  if (result.start_date && result.end_date && result.end_date < result.start_date) throw new Error('La fecha de fin no puede ser anterior al inicio.');
  const project = data.projects.find(p => p.id === result.project_id && p.company_id === companyId);
  if (project && result.currency_code && result.currency_code !== project.currency_code) throw new Error('Utiliza la moneda del proyecto. Los importes no se convierten automáticamente.');
  if (entity === 'timesheets') {
    if (existing?.status === 'invoiced') throw new Error('Este parte está facturado. Anula primero su factura para poder modificarlo.');
    if (project?.consultant_id && project.consultant_id !== result.consultant_id) throw new Error('Selecciona el consultor asignado al proyecto.');
    if (project?.start_date && string(result.work_date) < string(project.start_date) || project?.end_date && string(result.work_date) > string(project.end_date)) throw new Error('El día trabajado está fuera de las fechas del proyecto.');
    if (data.timesheets.some(r => r.id !== existing?.id && r.company_id === companyId && r.project_id === result.project_id && r.consultant_id === result.consultant_id && r.work_date === result.work_date)) throw new Error('Ya existe un parte para este consultor, proyecto y día. Edita el existente.');
  }
  const uniqueKey = entity === 'invoices' ? 'invoice_number' : entity === 'purchase_orders' ? 'po_number' : null;
  if (uniqueKey && data[entity].some(r => r.id !== existing?.id && r.company_id === companyId && string(r[uniqueKey]).toLowerCase() === string(result[uniqueKey]).toLowerCase())) throw new Error('Ese número ya existe en esta empresa.');
  if (entity === 'invoices') {
    if (string(result.due_date) < string(result.issue_date)) throw new Error('El vencimiento no puede ser anterior a la emisión.');
    const totals = invoiceTotals(number(result.subtotal_minor), number(result.tax_rate));
    if (totals.total_minor > MONEY_LIMIT) throw new Error('El importe total supera el máximo admitido.');
    if (!existing && result.status !== 'draft') throw new Error('Crea primero la factura como borrador. Después podrás cambiar su estado.');
    if (existing) {
      const transitions: Record<string, string[]> = { draft: ['draft', 'issued', 'cancelled'], issued: ['issued', 'paid', 'cancelled'], paid: ['paid'], cancelled: ['cancelled'] };
      if (!transitions[string(existing.status)]?.includes(string(result.status))) throw new Error('Este cambio de estado no está permitido.');
      if (existing.status !== 'draft' && Object.entries(result).some(([key, value]) => key !== 'status' && (value ?? '') !== (existing[key] ?? ''))) throw new Error('Una factura emitida solo admite cambios de estado.');
      if (data.timesheets.some(r => r.invoice_id === existing.id) && ['project_id','currency_code','subtotal_minor'].some(k => result[k] !== existing[k])) throw new Error('No puedes cambiar el proyecto, la moneda o la base de una factura vinculada a partes. Anúlala y vuelve a generarla.');
    }
    const po = data.purchase_orders.find(p => p.id === result.purchase_order_id && p.company_id === companyId);
    if (po) {
      if (po.project_id !== result.project_id || po.currency_code !== result.currency_code) throw new Error('La PO debe corresponder al mismo proyecto y moneda.');
      if (result.status !== 'cancelled') {
        if (po.status !== 'active' && (!existing || existing.purchase_order_id !== po.id || existing.subtotal_minor !== result.subtotal_minor)) throw new Error('La PO no está activa.');
        const consumed = data.invoices.filter(i => i.company_id === companyId && i.purchase_order_id === po.id && i.status !== 'cancelled' && i.id !== existing?.id).reduce((sum, i) => sum + number(i.subtotal_minor), 0);
        if (consumed + number(result.subtotal_minor) > number(po.amount_minor)) throw new Error('La base imponible supera el saldo disponible de la PO.');
      }
    }
  }
  if (entity === 'purchase_orders' && existing) {
    const invoices = data.invoices.filter(i => i.purchase_order_id === existing.id && i.status !== 'cancelled');
    if (invoices.length && (result.project_id !== existing.project_id || result.currency_code !== existing.currency_code)) throw new Error('Esta PO tiene facturas; no puedes cambiar su proyecto o moneda.');
    if (invoices.reduce((sum, i) => sum + number(i.subtotal_minor), 0) > number(result.amount_minor)) throw new Error('El presupuesto no puede ser inferior al importe ya comprometido.');
  }
  if (entity === 'projects' && existing && (result.currency_code !== existing.currency_code || result.client_id !== existing.client_id)) {
    if (['invoices','purchase_orders','expenses'].some(e => data[e as Entity].some(r => r.project_id === existing.id))) throw new Error('Este proyecto tiene documentos vinculados; conserva su cliente y moneda.');
  }
  if (entity === 'projects' && existing) {
    const parts = data.timesheets.filter(t => t.company_id === companyId && t.project_id === existing.id);
    if (parts.some(t => result.start_date && string(t.work_date) < string(result.start_date) || result.end_date && string(t.work_date) > string(result.end_date))) throw new Error('Las nuevas fechas excluyen partes ya registrados.');
    if (result.consultant_id && parts.some(t => t.consultant_id !== result.consultant_id)) throw new Error('Hay partes registrados de otro consultor; conserva la asignación del proyecto.');
  }
  return result;
}

export function validateRemoval(entity: Entity, row: EntityRecord, data: Dataset): void {
  if (entity === 'invoices' && row.status !== 'draft') throw new Error('Solo se pueden eliminar facturas en borrador.');
  if (entity === 'timesheets' && row.status === 'invoiced') throw new Error('No puedes eliminar un parte facturado.');
  if (entity === 'invoices' && data.timesheets.some(t => t.invoice_id === row.id)) throw new Error('Anula la factura para liberar sus partes antes de eliminarla.');
  for (const e of entityNames) for (const field of specs[e].fields) {
    if (field.entity === entity && data[e].some(r => r.company_id === row.company_id && r[field.key] === row.id)) throw new Error(`Este registro tiene ${specs[e].label.toLowerCase()} vinculados. No se puede eliminar.`);
  }
}
export type TimesheetInvoiceInput = { project_id: string; purchase_order_id: string | null; month: string; invoice_number: string; tax_rate: number; issue_date: string; due_date: string };
export function prepareTimesheetInvoice(data: Dataset, companyId: string, input: TimesheetInvoiceInput) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('Selecciona un mes válido.');
  const project = data.projects.find(p => p.id === input.project_id && p.company_id === companyId);
  if (!project) throw new Error('Proyecto no disponible para esta empresa.');
  const parts = data.timesheets.filter(t => t.company_id === companyId && t.project_id === project.id && t.status === 'approved' && !t.invoice_id && string(t.work_date).startsWith(input.month));
  if (!parts.length) throw new Error('No hay partes aprobados pendientes de facturar en este mes.');
  const thousandths = parts.reduce((sum, t) => sum + BigInt(Math.round(number(t.days) * 1000)), 0n);
  const subtotal = Number((thousandths * BigInt(number(project.sell_rate_minor)) + 500n) / 1000n);
  if (thousandths <= 0n || subtotal <= 0) throw new Error('Las jornadas y la tarifa de venta deben generar un importe positivo.');
  const values: RecordInput = { invoice_number: input.invoice_number, project_id: project.id, purchase_order_id: input.purchase_order_id || null, currency_code: project.currency_code, issue_date: input.issue_date, due_date: input.due_date, description: `Servicios ${input.month}`, subtotal_minor: subtotal, tax_rate: input.tax_rate, status: 'draft' };
  return { input: validateRecord('invoices', values, data, companyId), ids: parts.map(t => t.id) };
}

export function csvFor(entity: Entity, rows: EntityRecord[], dataset: Dataset): string {
  const spec = specs[entity];
  const keys = [...spec.columns];
  if (rows.some(r => r.currency_code) && !keys.includes('currency_code')) keys.push('currency_code');
  const escape = (value: string) => '"' + (/^[=+\-@\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') + '"';
  const header = keys.map(key => spec.fields.find(f => f.key === key)?.label ?? (key === 'total_minor' ? 'Total' : key)).map(escape).join(';');
  return '\uFEFF' + [header, ...rows.map(row => keys.map(key => {
    const field = spec.fields.find(f => f.key === key); let value = string(row[key]);
    if (key.endsWith('_minor')) value = String(fromMinor(number(row[key]), string(row.currency_code) || 'EUR')).replace('.', ',');
    else if (field?.entity) { const related = dataset[field.entity].find(r => r.id === value && r.company_id === row.company_id); value = related ? string(related[specs[field.entity].titleField]) : ''; }
    else if (field?.options) value = field.options.find(o => o.value === value)?.label ?? value;
    return escape(value);
  }).join(';'))].join('\r\n');
}
