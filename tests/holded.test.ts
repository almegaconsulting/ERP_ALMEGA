import assert from 'node:assert/strict';
import test from 'node:test';
import { HoldedError, HoldedReadClient, type HoldedTax } from '../lib/holded/client';
import { companyApiKey } from '../lib/holded/config';
import { prepareHoldedInvoice } from '../lib/holded/preparation';
import type { Company, EntityRecord, RecordInput } from '../lib/erp/types';
import { GET as statusRoute } from '../app/api/holded/status/route';
import { POST as submitRoute } from '../app/api/holded/invoices/[id]/submit/route';
import { POST as prepareRoute } from '../app/api/holded/invoices/[id]/prepare/route';

const companyId = '11111111-1111-4111-8111-111111111111';
const otherCompanyId = '22222222-2222-4222-8222-222222222222';
const contactId = '507f1f77bcf86cd799439011';
const company: Company = { id: companyId, name: 'Pruebas', legal_name: 'Pruebas SL', tax_id: 'B00000000', country_code: 'ES', currency_code: 'EUR', locale: 'es-ES', created_at: '2026-11-27' };
const invoice: EntityRecord = { id: '33333333-3333-4333-8333-333333333333', company_id: companyId, project_id: '66666666-6666-4666-8666-666666666666', created_at: '', updated_at: '', invoice_number: 'FAC-2026-001', status: 'draft', currency_code: 'EUR', subtotal_minor: 10000, tax_rate: 21, tax_minor: 2100, total_minor: 12100, issue_date: '2026-11-27', due_date: '2026-12-27', description: 'Consultoría', holded_id: null };
const localClient: EntityRecord = { id: '44444444-4444-4444-8444-444444444444', company_id: companyId, created_at: '', updated_at: '', name: 'Cliente de prueba', holded_contact_id: contactId };
const taxes: HoldedTax[] = [{ id: 'tax21', name: 'IVA ventas 21%', rate: 21, scope: 'sales', active: true }];
const expectedCode = (code: string) => (error: unknown) => error instanceof HoldedError && error.code === code;
const fetchJson = (body: unknown, status = 200): typeof fetch => async () => Response.json(body, { status });

test('contacts use Holded v2 bearer GET, encode cursor, and omit banking fields', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.holded.com');
    assert.equal(url.pathname, '/api/v2/contacts');
    assert.equal(url.searchParams.get('type'), 'client');
    assert.equal(url.searchParams.get('limit'), '50');
    assert.equal(url.searchParams.get('cursor'), 'opaque&url=https://untrusted.invalid');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-secret');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    return Response.json({ items: [{ id: contactId, name: 'Cliente', email: 'test@example.invalid', code: 'B00000000', bill_address: { country_code: 'ES' }, iban: 'PRIVATE', notes: ['PRIVATE'] }], cursor: 'next', has_more: true });
  };
  const result = await new HoldedReadClient('test-secret', fetcher).contacts('opaque&url=https://untrusted.invalid');
  assert.equal(calls, 1);
  assert.deepEqual(result, { items: [{ id: contactId, name: 'Cliente', email: 'test@example.invalid', tax_id: 'B00000000', country_code: 'ES' }], cursor: 'next', has_more: true });
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('contact resolution validates the requested identifier and provider match', async () => {
  const client = new HoldedReadClient('test-secret', fetchJson({ id: contactId, name: 'Cliente', vat_number: 'ESB00000000' }));
  assert.equal((await client.contact(contactId)).tax_id, 'ESB00000000');
  await assert.rejects(client.contact('../taxes'), expectedCode('HOLDED_CONTACT_REQUIRED'));
  await assert.rejects(client.contact('507f1f77bcf86cd799439012'), expectedCode('HOLDED_INVALID_RESPONSE'));
});

test('contact pages reject malformed data and incomplete pagination', async () => {
  for (const body of [{ items: [], has_more: true }, { items: [{ id: '' }], has_more: false }, { items: [], has_more: 'false' }, []]) {
    await assert.rejects(new HoldedReadClient('key', fetchJson(body)).contacts(), expectedCode('HOLDED_INVALID_RESPONSE'));
  }
  await assert.rejects(new HoldedReadClient('key', fetchJson({})).contacts('x'.repeat(2001)), expectedCode('INVALID_CURSOR'));
});

test('taxes preserve exact account IDs and fail closed for unknown percentages or inactive entries', async () => {
  const result = await new HoldedReadClient('key', fetchJson({ items: [
    { id: 'actual-id', name: 'IVA', amount: '21.00', scope: 'sales', status: true },
    { id: 'unknown', name: 'Compuesto', amount: null, status: true },
    { id: 'inactive', name: 'Inactivo', amount: '0', status: false },
    { id: 'invalid', name: 'Inválido', amount: '0x15', status: 'true' },
  ] })).taxes();
  assert.deepEqual(result.map(({ id, rate, active }) => ({ id, rate, active })), [
    { id: 'actual-id', rate: 21, active: true }, { id: 'unknown', rate: null, active: true },
    { id: 'inactive', rate: 0, active: false }, { id: 'invalid', rate: null, active: false },
  ]);
});

test('provider failures are sanitized and never retried', async () => {
  for (const [status, code] of [[401, 'HOLDED_ACCESS_DENIED'], [403, 'HOLDED_ACCESS_DENIED'], [404, 'HOLDED_NOT_FOUND'], [429, 'HOLDED_RATE_LIMIT'], [500, 'HOLDED_UNAVAILABLE']] as const) {
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return new Response('DO-NOT-EXPOSE test-secret', { status }); };
    await assert.rejects(new HoldedReadClient('test-secret', fetcher).taxes(), (error: unknown) => {
      assert.ok(error instanceof HoldedError);
      assert.equal(error.code, code);
      assert.ok(!error.message.includes('test-secret'));
      assert.ok(!error.message.includes('DO-NOT-EXPOSE'));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('timeout aborts a single GET; network exception details remain private', async () => {
  let calls = 0;
  const waiting: typeof fetch = async (_input, init) => {
    calls++;
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('private network error')), { once: true }));
  };
  await assert.rejects(new HoldedReadClient('key', waiting, 5).taxes(), expectedCode('HOLDED_TIMEOUT'));
  assert.equal(calls, 1);
  const broken: typeof fetch = async () => { throw new Error('private URL key=secret'); };
  await assert.rejects(new HoldedReadClient('key', broken).taxes(), (error: unknown) => error instanceof HoldedError && error.code === 'HOLDED_UNAVAILABLE' && !error.message.includes('secret'));
});

test('configuration selects only the exact company and does not leak malformed secrets', () => {
  assert.equal(companyApiKey(companyId, JSON.stringify({ [companyId]: 'first', [otherCompanyId]: 'second' })), 'first');
  assert.equal(companyApiKey(companyId, JSON.stringify({ [otherCompanyId]: 'second' })), null);
  assert.equal(companyApiKey('toString', '{}'), null);
  assert.equal(companyApiKey(companyId, ''), null);
  for (const raw of ['secret broken json', '[]', 'null', JSON.stringify({ [companyId]: 'secret\r\nvalue' }), JSON.stringify({ [companyId]: 123 })]) {
    assert.throws(() => companyApiKey(companyId, raw), (error: unknown) => error instanceof HoldedError && error.code === 'HOLDED_CONFIG_INVALID' && !error.message.includes('secret'));
  }
});

test('preparation maps integer minor units, explicit taxes, stable hash, and internal reference', () => {
  const result = prepareHoldedInvoice(invoice, localClient, company, taxes, { taxId: 'tax21' });
  assert.equal(result.payload.items[0].price, 100);
  assert.deepEqual(result.payload.items[0].taxes, ['tax21']);
  assert.equal(result.payload.contact_id, contactId);
  assert.equal(result.payload.default_taxes, false);
  assert.ok(result.payload.notes.includes(invoice.id));
  assert.ok(!('number' in result.payload));
  assert.ok(!('direct_debit_provider' in result.payload));
  assert.ok(!('currency_change' in result.payload));
  assert.match(result.requestHash, /^[0-9a-f]{64}$/);
  assert.equal(result.requestHash, prepareHoldedInvoice({ ...invoice }, { ...localClient }, { ...company }, [...taxes], { taxId: 'tax21' }).requestHash);
  assert.notEqual(result.requestHash, prepareHoldedInvoice({ ...invoice, description: 'Otro servicio' }, localClient, company, taxes, { taxId: 'tax21' }).requestHash);
  assert.equal(invoice.holded_id, null);
  assert.equal(invoice.status, 'draft');
});

test('preparation rejects cross-company records, existing exports and non-draft invoices', () => {
  const blocked: RecordInput[] = [{ company_id: otherCompanyId }, { status: 'issued' }, { holded_id: 'existing' }];
  for (const changes of blocked) {
    assert.throws(() => prepareHoldedInvoice({ ...invoice, ...changes }, localClient, company, taxes, { taxId: 'tax21' }), HoldedError);
  }
  assert.throws(() => prepareHoldedInvoice(invoice, { ...localClient, company_id: otherCompanyId }, company, taxes, { taxId: 'tax21' }), expectedCode('COMPANY_MISMATCH'));
  assert.throws(() => prepareHoldedInvoice(invoice, { ...localClient, holded_contact_id: '' }, company, taxes, { taxId: 'tax21' }), expectedCode('HOLDED_CONTACT_REQUIRED'));
});

test('preparation checks totals and half-up rounding in minor units', () => {
  const halfTax = [{ ...taxes[0], id: 'half', rate: 50 }];
  const small = { ...invoice, subtotal_minor: 1, tax_rate: 50, tax_minor: 1, total_minor: 2 };
  assert.equal(prepareHoldedInvoice(small, localClient, company, halfTax, { taxId: 'half' }).payload.items[0].price, 0.01);
  assert.throws(() => prepareHoldedInvoice({ ...small, tax_minor: 0, total_minor: 1 }, localClient, company, halfTax, { taxId: 'half' }), expectedCode('INVOICE_TOTAL_MISMATCH'));
  const invalidAmounts: RecordInput[] = [{ subtotal_minor: -1 }, { subtotal_minor: 1.5 }, { subtotal_minor: Number.MAX_SAFE_INTEGER + 1 }, { subtotal_minor: 0 }, { tax_rate: 21.001 }, { total_minor: 12101 }];
  for (const changes of invalidAmounts) {
    assert.throws(() => prepareHoldedInvoice({ ...invoice, ...changes }, localClient, company, taxes, { taxId: 'tax21' }), HoldedError);
  }
});

test('preparation requires explicit matching active tax even at zero percent', () => {
  assert.throws(() => prepareHoldedInvoice(invoice, localClient, company, [{ ...taxes[0], active: false }], { taxId: 'tax21' }), expectedCode('HOLDED_TAX_MISMATCH'));
  assert.throws(() => prepareHoldedInvoice(invoice, localClient, company, [{ ...taxes[0], rate: 10 }], { taxId: 'tax21' }), expectedCode('HOLDED_TAX_MISMATCH'));
  const zeroInvoice = { ...invoice, tax_rate: 0, tax_minor: 0, total_minor: 10000 };
  assert.throws(() => prepareHoldedInvoice(zeroInvoice, localClient, company, [], { taxId: '' }), expectedCode('HOLDED_TAX_MISMATCH'));
  const zero = [{ ...taxes[0], id: 'exemption-selected-by-user', rate: 0 }];
  assert.deepEqual(prepareHoldedInvoice(zeroInvoice, localClient, company, zero, { taxId: zero[0].id }).payload.items[0].taxes, [zero[0].id]);
});

test('preparation validates calendar dates and due-date order', () => {
  const invalidDates: RecordInput[] = [{ issue_date: '2026-02-30' }, { due_date: '2026-11-26' }, { issue_date: '27/11/2026' }, { due_date: null }];
  for (const changes of invalidDates) {
    assert.throws(() => prepareHoldedInvoice({ ...invoice, ...changes }, localClient, company, taxes, { taxId: 'tax21' }), expectedCode('INVALID_INVOICE_DATE'));
  }
});

test('JPY has zero minor digits and foreign currency requires an explicit exchange rate', () => {
  const jpyInvoice = { ...invoice, currency_code: 'JPY' };
  assert.equal(prepareHoldedInvoice(jpyInvoice, localClient, { ...company, currency_code: 'JPY' }, taxes, { taxId: 'tax21' }).payload.items[0].price, 10000);
  assert.throws(() => prepareHoldedInvoice(jpyInvoice, localClient, company, taxes, { taxId: 'tax21' }), expectedCode('EXCHANGE_RATE_REQUIRED'));
  assert.equal(prepareHoldedInvoice(jpyInvoice, localClient, company, taxes, { taxId: 'tax21', exchangeRate: 160 }).payload.currency_change, 160);
  assert.throws(() => prepareHoldedInvoice({ ...invoice, currency_code: 'INVALID' }, localClient, company, taxes, { taxId: 'tax21' }), expectedCode('INVALID_CURRENCY'));
});

// Exercise real Route Handlers + Supabase auth adapter against a network mock only.
async function withMockAuth(role: string | null, run: (calls: string[]) => Promise<void>, extra?: (url: URL, init?: RequestInit) => Response | undefined) {
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'HOLDED_API_KEYS_JSON'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase-test.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anonymous-key';
  process.env.HOLDED_API_KEYS_JSON = JSON.stringify({ [companyId]: 'server-secret-never-return' });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    const handled = extra?.(url, init);
    if (handled) return handled;
    assert.equal(url.origin, 'https://supabase-test.invalid', 'No real provider request is allowed in route tests');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: '55555555-5555-4555-8555-555555555555', aud: 'authenticated', role: 'authenticated', email: 'owner@example.invalid' });
    if (url.pathname === '/rest/v1/erp_company_members') return Response.json(role ? [{ role }] : []);
    throw new Error(`Unexpected test request: ${url.pathname}`);
  };
  try { await run(calls); }
  finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

const bearer = { Authorization: 'Bearer test-user-session-with-sufficient-length', 'Content-Type': 'application/json' };

test('status requires authentication and owner/admin membership without exposing the server key', async () => {
  await withMockAuth('owner', async calls => {
    const denied = await statusRoute(new Request(`https://mini.invalid/api/holded/status?company_id=${companyId}`));
    assert.equal(denied.status, 401);
    assert.equal(calls.length, 0);
    const allowed = await statusRoute(new Request(`https://mini.invalid/api/holded/status?company_id=${companyId}`, { headers: bearer }));
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('Cache-Control'), 'no-store');
    const body = await allowed.text();
    assert.ok(!body.includes('server-secret'));
    const result = JSON.parse(body);
    assert.equal(result.configured, true);
    assert.equal(result.connectionVerified, false);
    assert.equal(result.outboundEnabled, false);
  });
  for (const role of ['manager', 'viewer', null]) {
    await withMockAuth(role, async () => {
      const response = await statusRoute(new Request(`https://mini.invalid/api/holded/status?company_id=${companyId}`, { headers: bearer }));
      assert.equal(response.status, 403);
    });
  }
});

test('even an owner cannot submit an external invoice until draft-only creation is guaranteed', async () => {
  await withMockAuth('owner', async calls => {
    const request = new Request('https://mini.invalid/api/holded/invoices/invoice/submit', { method: 'POST', headers: bearer, body: JSON.stringify({ company_id: companyId, confirm: true }) });
    const response = await submitRoute(request);
    assert.equal(response.status, 409);
    const result = await response.json();
    assert.equal(result.code, 'DRAFT_MODE_UNVERIFIED');
    assert.equal(result.sentToHolded, false);
    assert.deepEqual(calls, ['/auth/v1/user', '/rest/v1/erp_company_members']);
  });
});

test('prepare scopes every database read, verifies the linked Holded contact, and never writes', async () => {
  for (const existingExport of [false, true]) {
    await withMockAuth('admin', async calls => {
      const response = await prepareRoute(new Request(`https://mini.invalid/api/holded/invoices/${invoice.id}/prepare`, { method: 'POST', headers: bearer, body: JSON.stringify({ company_id: companyId, tax_id: 'tax21' }) }), { params: Promise.resolve({ id: invoice.id }) });
      if (existingExport) {
        assert.equal(response.status, 409);
        assert.equal((await response.json()).code, 'HOLDED_EXPORT_EXISTS');
        assert.ok(!calls.some(path => path.startsWith('/api/v2/')));
      } else {
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.canSubmit, false);
        assert.equal(body.sentToHolded, false);
        assert.equal(body.payload.contact_id, contactId);
        assert.equal(body.holdedContact.id, contactId);
        assert.equal(body.payload.items[0].price, 100);
        assert.equal(calls.filter(path => path.startsWith('/api/v2/')).length, 2);
      }
    }, (url, init) => {
      assert.ok(init?.method === 'GET' || init?.method === undefined, 'Preparation must not perform remote or local writes');
      if (url.origin === 'https://api.holded.com') {
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer server-secret-never-return');
        if (url.pathname === '/api/v2/taxes') return Response.json({ items: [{ id: 'tax21', name: 'IVA', amount: '21', status: true }] });
        if (url.pathname === `/api/v2/contacts/${contactId}`) return Response.json({ id: contactId, name: 'Cliente Holded' });
        assert.fail('Unexpected Holded endpoint');
      }
      if (url.pathname.startsWith('/rest/v1/erp_') && !url.pathname.endsWith('/erp_company_members')) {
        assert.equal(url.searchParams.get(url.pathname.endsWith('/erp_companies') ? 'id' : 'company_id'), `eq.${companyId}`);
        if (url.pathname.endsWith('/erp_invoices')) { assert.equal(url.searchParams.get('id'), `eq.${invoice.id}`); return Response.json([invoice]); }
        if (url.pathname.endsWith('/erp_projects')) return Response.json([{ client_id: localClient.id }]);
        if (url.pathname.endsWith('/erp_clients')) return Response.json([localClient]);
        if (url.pathname.endsWith('/erp_companies')) return Response.json([company]);
        if (url.pathname.endsWith('/erp_holded_exports')) return Response.json(existingExport ? [{ status: 'pending', holded_id: null }] : []);
      }
      return undefined;
    });
  }
});
