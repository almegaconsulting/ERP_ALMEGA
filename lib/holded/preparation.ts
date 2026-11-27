import { createHash } from 'node:crypto';
import type { Company, EntityRecord } from '../erp/types';
import { currencies } from '../erp/config';
import { HoldedError, type HoldedTax } from './client';

export type HoldedInvoicePayload = {
  contact_id: string; description: string; date: string; due_date: string; notes: string;
  default_taxes: false; language: 'es'; currency: string; currency_change?: number;
  items: { name: string; type: 'service'; units: 1; price: number; taxes: string[] }[];
};
export type PrepareOptions = { taxId: string; exchangeRate?: number };

const fail = (code: string, message: string): never => { throw new HoldedError(code, message, 422); };
const date = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('INVALID_INVOICE_DATE', `${label} no es válida.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) return fail('INVALID_INVOICE_DATE', `${label} no es válida.`);
  return value;
};
const minor = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return fail('INVALID_INVOICE_AMOUNT', `${label} no es válido.`);
  return value;
};

/** Pure mapping. It neither creates a document nor updates invoice status. */
export function prepareHoldedInvoice(invoice: EntityRecord, client: EntityRecord, company: Company, taxes: readonly HoldedTax[], options: PrepareOptions) {
  if (invoice.company_id !== company.id || client.company_id !== company.id) return fail('COMPANY_MISMATCH', 'La factura y el cliente deben pertenecer a la empresa seleccionada.');
  if (invoice.status !== 'draft') return fail('INVOICE_NOT_DRAFT', 'Solo se pueden preparar facturas en borrador.');
  if (invoice.holded_id) return fail('INVOICE_ALREADY_LINKED', 'Esta factura ya está vinculada a Holded.');
  const contactId = typeof client.holded_contact_id === 'string' ? client.holded_contact_id.trim() : '';
  if (!/^[0-9a-f]{24}$/i.test(contactId)) return fail('HOLDED_CONTACT_REQUIRED', 'Vincula el cliente con su identificador de contacto en Holded antes de preparar la factura.');
  const currency = invoice.currency_code;
  if (typeof currency !== 'string' || !currencies.some(c => c.value === currency)) return fail('INVALID_CURRENCY', 'La moneda de la factura no está admitida.');
  const subtotal = minor(invoice.subtotal_minor, 'La base imponible');
  const taxMinor = minor(invoice.tax_minor, 'El impuesto');
  const total = minor(invoice.total_minor, 'El total');
  const taxRate = invoice.tax_rate;
  if (subtotal === 0 || typeof taxRate !== 'number' || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return fail('INVALID_INVOICE_AMOUNT', 'La factura necesita una base positiva y un porcentaje de impuesto válido.');
  // Percentages have at most two decimal places in the ERP. Calculate with integer basis points.
  const basisPoints = Math.round(taxRate * 100);
  if (Math.abs(taxRate * 100 - basisPoints) > 1e-7) return fail('INVALID_TAX_RATE', 'El porcentaje de impuesto admite dos decimales.');
  const calculatedTax = Number((BigInt(subtotal) * BigInt(basisPoints) + BigInt(5000)) / BigInt(10000));
  if (calculatedTax !== taxMinor || total !== subtotal + taxMinor) return fail('INVOICE_TOTAL_MISMATCH', 'La base, los impuestos y el total de la factura no coinciden.');
  const selectedTax = taxes.find(t => t.id === options.taxId);
  // A zero-rate tax is explicit too: do not infer exemption or inherit a contact's defaults.
  if (!selectedTax || !selectedTax.active || selectedTax.rate === null || Math.abs(selectedTax.rate - taxRate) > 1e-7) return fail('HOLDED_TAX_MISMATCH', 'Selecciona un impuesto activo de Holded cuyo porcentaje coincida con el de la factura.');
  const issueDate = date(invoice.issue_date, 'La fecha de emisión');
  const dueDate = date(invoice.due_date, 'La fecha de vencimiento');
  if (dueDate < issueDate) return fail('INVALID_INVOICE_DATE', 'El vencimiento no puede ser anterior a la emisión.');
  if (typeof invoice.description !== 'string' || !invoice.description.trim() || invoice.description.length > 4000) return fail('INVALID_INVOICE_DESCRIPTION', 'La factura necesita un concepto válido.');
  const digits = currency === 'JPY' || currency === 'CLP' ? 0 : 2;
  const payload: HoldedInvoicePayload = {
    contact_id: contactId,
    description: invoice.description.trim(),
    date: issueDate,
    due_date: dueDate,
    notes: `MiniERP · ${String(invoice.invoice_number)} · referencia ${invoice.id}`,
    default_taxes: false,
    language: 'es',
    currency,
    items: [{ name: invoice.description.trim(), type: 'service', units: 1, price: subtotal / 10 ** digits, taxes: [selectedTax.id] }],
  };
  if (currency !== company.currency_code) {
    if (typeof options.exchangeRate !== 'number' || !Number.isFinite(options.exchangeRate) || options.exchangeRate <= 0 || options.exchangeRate > 1_000_000) return fail('EXCHANGE_RATE_REQUIRED', 'Indica el tipo de cambio comprobado para preparar una factura en otra moneda.');
    payload.currency_change = options.exchangeRate;
  }
  // Do not copy MiniERP's number into a live Holded numbering series.
  const requestHash = createHash('sha256').update(JSON.stringify({ company_id: company.id, invoice_id: invoice.id, payload })).digest('hex');
  return {
    payload,
    requestHash,
    summary: { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, clientName: client.name, currency, subtotalMinor: subtotal, taxMinor, totalMinor: total, taxName: selectedTax.name },
    notes: ['La numeración final se asignará en Holded; la referencia del MiniERP se conserva en las notas.', 'Revisa el tratamiento fiscal y confirma que la moneda base de esta empresa coincide con la de la cuenta Holded; si procede, comprueba también el sentido del tipo de cambio.'],
  };
}
