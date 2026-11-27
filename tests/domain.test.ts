import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../lib/erp/demo';
import { MONEY_LIMIT, csvFor, fromMinor, invoiceTotals, minorDigits, prepareTimesheetInvoice, toMinor, validateRecord, validateRemoval, type TimesheetInvoiceInput } from '../lib/erp/domain';
import type { Dataset, EntityRecord, RecordInput } from '../lib/erp/types';

const fixture = () => createDemoState('2026-11-27');
const draftInput = (data: Dataset, overrides: RecordInput = {}): RecordInput => ({
  invoice_number: 'TEST-2026-NEW', project_id: data.projects[0].id,
  purchase_order_id: data.purchase_orders[0].id, currency_code: 'EUR',
  issue_date: '2026-11-27', due_date: '2026-12-27', description: 'Servicios de prueba',
  subtotal_minor: 10000, tax_rate: 21, status: 'draft', ...overrides,
});
const billingInput = (data: Dataset, overrides: Partial<TimesheetInvoiceInput> = {}): TimesheetInvoiceInput => ({
  project_id: data.projects[0].id, purchase_order_id: data.purchase_orders[0].id,
  month: '2026-11', invoice_number: 'TEST-PARTES-001', tax_rate: 21,
  issue_date: '2026-11-27', due_date: '2026-12-27', ...overrides,
});

test('decimal money becomes exact integer minor units without binary rounding', () => {
  assert.equal(toMinor('0.29'), 29);
  assert.equal(toMinor(0.29), 29);
  assert.equal(toMinor('1234,56'), 123456);
  assert.equal(toMinor('12.3000'), 1230);
  assert.equal(toMinor('10000000000.00'), MONEY_LIMIT);
  assert.equal(fromMinor(123456), 1234.56);
  for (const value of ['0.001', '1.005', '-1', '1e3', 'Infinity', '1,234.56', '10000000000.01']) {
    assert.throws(() => toMinor(value), Error, `Unexpected acceptance of ${value}`);
  }
});

test('JPY and CLP preserve whole units and reject fractional amounts', () => {
  for (const currency of ['JPY', 'CLP']) {
    assert.equal(minorDigits(currency), 0);
    assert.equal(toMinor('12345', currency), 12345);
    assert.equal(toMinor('12345.000', currency), 12345);
    assert.equal(fromMinor(12345, currency), 12345);
    assert.throws(() => toMinor('12345.01', currency), /0 decimales/);
  }
});

test('tax totals round half up in minor units and validate percentage precision', () => {
  assert.deepEqual(invoiceTotals(10000, 21), { subtotal_minor: 10000, tax_minor: 2100, total_minor: 12100 });
  assert.deepEqual(invoiceTotals(1, 50), { subtotal_minor: 1, tax_minor: 1, total_minor: 2 });
  assert.deepEqual(invoiceTotals(5000, 0.01), { subtotal_minor: 5000, tax_minor: 1, total_minor: 5001 });
  assert.equal(invoiceTotals(MONEY_LIMIT, 0).total_minor, MONEY_LIMIT);
  assert.throws(() => invoiceTotals(10.5, 21), /no válidos/);
  assert.throws(() => invoiceTotals(100, 21.001), /no válidos/);
  assert.throws(() => invoiceTotals(100, Number.NaN), /no válidos/);
  assert.throws(() => invoiceTotals(100, 101), /no válidos/);
});

test('references and existing records must belong to the selected company', () => {
  const { records, companies } = fixture();
  const localId = companies[0].id;
  const foreignClient = records.clients.find(row => row.company_id === companies[1].id)!;
  assert.throws(() => validateRecord('contacts', { name: 'Contacto', client_id: foreignClient.id }, records, localId), /no pertenece a esta empresa/);
  assert.throws(() => validateRecord('clients', { name: 'Cambio indebido' }, records, localId, foreignClient), /no pertenece a esta empresa/);
  assert.throws(() => validateRecord('clients', { name: 'Cliente', company_id: companies[1].id }, records, localId), /Campo no editable/);
  const valid = validateRecord('contacts', { name: 'Contacto local', client_id: records.clients[0].id }, records, localId);
  assert.equal(valid.client_id, records.clients[0].id);
});

test('an optional reference can be explicitly cleared with null on an existing draft', () => {
  const { records, companies } = fixture();
  const draft = { ...records.invoices[0], status: 'draft' };
  records.invoices[0] = draft;
  const changed = validateRecord('invoices', { purchase_order_id: null }, records, companies[0].id, draft);
  assert.equal(changed.purchase_order_id, null, 'An explicit null must remove the old PO instead of silently restoring it');
});

test('PO budget consumes invoice subtotal, excludes cancelled invoices and includes drafts', () => {
  const { records, companies } = fixture();
  records.purchase_orders[0].amount_minor = 10000;
  const base = records.invoices[0];
  records.invoices = [
    { ...base, status: 'paid', ...invoiceTotals(5000, 21) },
    { ...base, id: crypto.randomUUID(), invoice_number: 'TEST-DRAFT', status: 'draft', ...invoiceTotals(2000, 21) },
    { ...base, id: crypto.randomUUID(), invoice_number: 'TEST-CANCELLED', status: 'cancelled', ...invoiceTotals(90000, 21) },
  ];
  const exact = validateRecord('invoices', draftInput(records, { subtotal_minor: 3000 }), records, companies[0].id);
  assert.equal(exact.subtotal_minor, 3000, 'Tax does not consume the PO budget');
  assert.throws(() => validateRecord('invoices', draftInput(records, { subtotal_minor: 3001 }), records, companies[0].id), /saldo disponible/);
  assert.throws(() => validateRecord('purchase_orders', { amount_minor: 6999 }, records, companies[0].id, records.purchase_orders[0]), /ya comprometido/);
});

test('a new invoice requires an active PO from the same project and currency', () => {
  const { records, companies } = fixture();
  assert.throws(() => validateRecord('invoices', draftInput(records, { purchase_order_id: records.purchase_orders[1].id }), records, companies[0].id), /mismo proyecto y moneda/);
  assert.throws(() => validateRecord('invoices', draftInput(records, { currency_code: 'USD' }), records, companies[0].id), /moneda del proyecto/);
  records.purchase_orders[0].status = 'closed';
  assert.throws(() => validateRecord('invoices', draftInput(records), records, companies[0].id), /PO no está activa/);
});

test('invoice lifecycle permits draft to issued to paid and blocks backwards or skipped steps', () => {
  const { records, companies } = fixture();
  const draft = { ...records.invoices[0], status: 'draft' };
  records.invoices[0] = draft;
  const issued = validateRecord('invoices', { status: 'issued' }, records, companies[0].id, draft);
  assert.equal(issued.status, 'issued');
  const issuedRow: EntityRecord = { ...draft, ...issued };
  assert.equal(validateRecord('invoices', { status: 'paid' }, records, companies[0].id, issuedRow).status, 'paid');
  assert.equal(validateRecord('invoices', { status: 'cancelled' }, records, companies[0].id, issuedRow).status, 'cancelled');
  assert.throws(() => validateRecord('invoices', { status: 'paid' }, records, companies[0].id, draft), /no está permitido/);
  assert.throws(() => validateRecord('invoices', { status: 'draft' }, records, companies[0].id, issuedRow), /no está permitido/);
  assert.throws(() => validateRecord('invoices', { status: 'cancelled' }, records, companies[0].id, { ...draft, status: 'paid' }), /no está permitido/);
  assert.throws(() => validateRecord('invoices', draftInput(records, { status: 'issued' }), records, companies[0].id), /primero la factura como borrador/);
});

test('issued invoices and invoices linked to timesheets protect their financial data', () => {
  const { records, companies } = fixture();
  const issued = { ...records.invoices[0], status: 'issued' };
  assert.throws(() => validateRecord('invoices', { description: 'Cambio posterior' }, records, companies[0].id, issued), /solo admite cambios de estado/);
  assert.throws(() => validateRemoval('invoices', issued, records), /Solo se pueden eliminar/);
  const draft = { ...issued, status: 'draft' };
  records.invoices[0] = draft;
  records.timesheets[0] = { ...records.timesheets[0], status: 'invoiced', invoice_id: draft.id };
  assert.throws(() => validateRecord('invoices', { subtotal_minor: 1 }, records, companies[0].id, draft), /vinculada a partes/);
  assert.throws(() => validateRemoval('invoices', draft, records), /liberar sus partes/);
  assert.throws(() => validateRemoval('timesheets', records.timesheets[0], records), /parte facturado/);
});

test('invoice and PO numbers are unique within a company regardless of case', () => {
  const { records, companies } = fixture();
  assert.throws(() => validateRecord('invoices', draftInput(records, { invoice_number: String(records.invoices[0].invoice_number).toLowerCase() }), records, companies[0].id), /número ya existe/);
  assert.throws(() => validateRecord('purchase_orders', { po_number: String(records.purchase_orders[0].po_number).toLowerCase(), project_id: records.projects[0].id, currency_code: 'EUR', amount_minor: 10000 }, records, companies[0].id), /número ya existe/);
});

test('CSV protects formula prefixes, escapes quotes and does not resolve foreign-company names', () => {
  const { records, companies } = fixture();
  const sample = records.clients[0];
  const names = ['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\t=1+1', '\r=1+1', 'Cliente "Especial"'];
  const csv = csvFor('clients', names.map((name, index) => ({ ...sample, id: `csv-${index}`, name })), records);
  assert.ok(csv.startsWith('\uFEFF'));
  for (const expected of ['"\'=1+1"', '"\'+1+1"', '"\'-1+1"', '"\'@SUM(A1)"', '"\'\t=1+1"', '"\'\r=1+1"', '"Cliente ""Especial"""']) assert.ok(csv.includes(expected), `Missing escaped value ${JSON.stringify(expected)}`);
  const foreignClient = records.clients.find(row => row.company_id === companies[1].id)!;
  const contactCsv = csvFor('contacts', [{ ...records.contacts[0], client_id: foreignClient.id }], records);
  assert.ok(!contactCsv.includes(String(foreignClient.name)));
});

test('CSV exports visible monetary amounts with their currencies including JPY and CLP', () => {
  const { records } = fixture();
  const base = records.opportunities[0];
  const csv = csvFor('opportunities', [
    { ...base, id: 'csv-eur', amount_minor: 1049, currency_code: 'EUR' },
    { ...base, id: 'csv-jpy', amount_minor: 1049, currency_code: 'JPY' },
    { ...base, id: 'csv-clp', amount_minor: 1049, currency_code: 'CLP' },
  ], records);
  const lines = csv.split('\r\n');
  assert.ok(lines[0].includes('"Moneda"'));
  assert.ok(lines[1].includes('"10,49"'));
  assert.match(lines[1], /"EUR(?: · [^"]+)?"$/);
  assert.ok(lines[2].includes('"1049"'));
  assert.match(lines[2], /"JPY(?: · [^"]+)?"$/);
  assert.ok(lines[3].includes('"1049"'));
  assert.match(lines[3], /"CLP(?: · [^"]+)?"$/);
});

test('timesheet billing selects only approved, unbilled days for the project, company and month', () => {
  const { records, companies } = fixture();
  const original = records.timesheets[0];
  const eligibleIds = records.timesheets.filter(t => t.project_id === records.projects[0].id && t.status === 'approved').map(t => t.id);
  records.timesheets.push(
    { ...original, id: crypto.randomUUID(), work_date: '2026-10-20' },
    { ...original, id: crypto.randomUUID(), company_id: companies[1].id },
    { ...original, id: crypto.randomUUID(), invoice_id: records.invoices[0].id },
    { ...original, id: crypto.randomUUID(), status: 'rejected' },
  );
  const snapshot = JSON.stringify(records);
  const result = prepareTimesheetInvoice(records, companies[0].id, billingInput(records));
  assert.deepEqual(result.ids, eligibleIds);
  assert.equal(result.input.subtotal_minor, 208000);
  assert.equal(result.input.currency_code, 'EUR');
  assert.equal(result.input.status, 'draft');
  assert.equal(JSON.stringify(records), snapshot, 'Preparation must not silently mark any timesheet as billed');
});

test('fractional days are aggregated before rounding the invoice subtotal', () => {
  const { records, companies } = fixture();
  records.projects[0].sell_rate_minor = 101;
  records.timesheets = records.timesheets.slice(0, 2).map(row => ({ ...row, days: 0.125, status: 'approved' }));
  const result = prepareTimesheetInvoice(records, companies[0].id, billingInput(records));
  assert.equal(result.input.subtotal_minor, 25, 'Two 0.125-day parts at 101 minor units yield 25, not separately rounded 26');
  records.timesheets[1].days = 0.25;
  assert.equal(prepareTimesheetInvoice(records, companies[0].id, billingInput(records)).input.subtotal_minor, 38);
});

test('timesheet billing refuses zero days, zero rate and months without approved work', () => {
  const { records, companies } = fixture();
  const emptyMonth = billingInput(records, { month: '2026-10' });
  assert.throws(() => prepareTimesheetInvoice(records, companies[0].id, emptyMonth), /No hay partes aprobados/);
  records.timesheets = records.timesheets.map(row => ({ ...row, days: 0 }));
  assert.throws(() => prepareTimesheetInvoice(records, companies[0].id, billingInput(records)), /jornadas y la tarifa/);
  records.timesheets[0].days = 1;
  records.projects[0].sell_rate_minor = 0;
  assert.throws(() => prepareTimesheetInvoice(records, companies[0].id, billingInput(records)), /jornadas y la tarifa/);
});
