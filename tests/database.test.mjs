import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pageinspect } from '@electric-sql/pglite/contrib/pageinspect';

let db;
const ids = {
  ownerA: '10000000-0000-4000-8000-000000000001', ownerB: '10000000-0000-4000-8000-000000000002',
  viewer: '10000000-0000-4000-8000-000000000003', manager: '10000000-0000-4000-8000-000000000004',
  admin: '10000000-0000-4000-8000-000000000005', outsider: '10000000-0000-4000-8000-000000000006',
};
const f = {};
const query = (sql, params = []) => db.query(sql, params);
const first = async (sql, params = []) => (await query(sql, params)).rows[0];
const actAs = async (user, local = true) => {
  await db.exec(`set ${local ? 'local ' : ''}role authenticated`);
  await query("select set_config('request.jwt.claim.sub',$1,$2)", [user, local]);
};
const fail = async (sql, params = [], codes = []) => {
  await db.exec('savepoint rejected_operation');
  let error;
  try { await query(sql, params); } catch (caught) { error = caught; }
  await db.exec('rollback to savepoint rejected_operation; release savepoint rejected_operation');
  assert.ok(error, `Expected PostgreSQL to reject: ${sql}`);
  if (codes.length) assert.ok(codes.includes(error.code), `Expected ${codes.join('/')} but got ${error.code}: ${error.message}`);
  return error;
};
function dbTest(name, fn) {
  test(name, async () => {
    await db.exec('begin');
    try { await actAs(ids.ownerA); await fn(); }
    finally { await db.exec('rollback; reset role'); }
  });
}
async function invoice(number, amount = 1000, po = null) {
  return first(`insert into public.erp_invoices(company_id,project_id,purchase_order_id,invoice_number,currency_code,issue_date,due_date,description,subtotal_minor,tax_rate)
    values($1,$2,$3,$4,'EUR','2026-11-27','2026-12-27','Servicios de prueba',$5,21) returning *`, [f.companyA, f.projectA, po, number, amount]);
}
async function part(date, days = 1, status = 'approved') {
  return first(`insert into public.erp_timesheets(company_id,project_id,consultant_id,work_date,hours,days,status)
    values($1,$2,$3,$4,8,$5,$6) returning *`, [f.companyA, f.projectA, f.consultantA, date, days, status]);
}
const bill = (number, po = null, company = f.companyA, project = f.projectA) => first(
  `select * from public.erp_invoice_timesheets($1,$2,$3,'2026-11',$4,21,'2026-11-27','2026-12-27')`, [company, project, po, number]);

before(async () => {
  db = new PGlite({ extensions: { pageinspect } });
  // Test-only inspection proves the actual PostgreSQL row lock mode. This
  // extension is already bundled with PGlite and is not required in production.
  await db.exec('create extension pageinspect');
  // Only the Supabase Auth contract is emulated. Tables, FK constraints, functions,
  // RLS, grants and transactions under test are the real migration executed by PostgreSQL.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text unique);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/202611270001_minierp.sql', import.meta.url), 'utf8'));
  for (const [name, id] of Object.entries(ids)) await query('insert into auth.users(id,email) values($1,$2)', [id, `${name.toLowerCase()}@example.test`]);
  await actAs(ids.ownerA, false);
  f.companyA = (await first("select * from public.erp_create_company('Empresa A','Empresa A SL','TEST-A','ES','EUR','es-ES')")).id;
  f.clientA = (await first("insert into public.erp_clients(company_id,name) values($1,'Cliente A') returning id", [f.companyA])).id;
  f.consultantA = (await first("insert into public.erp_consultants(company_id,full_name,email,cost_rate_minor) values($1,'Consultor A','consultor.a@example.test',30000) returning id", [f.companyA])).id;
  f.consultantA2 = (await first("insert into public.erp_consultants(company_id,full_name,email) values($1,'Consultor extra','extra@example.test') returning id", [f.companyA])).id;
  f.projectA = (await first(`insert into public.erp_projects(company_id,client_id,consultant_id,name,sell_rate_minor,cost_rate_minor,start_date,end_date)
    values($1,$2,$3,'Proyecto A',50000,30000,'2026-11-01','2026-12-31') returning id`, [f.companyA, f.clientA, f.consultantA])).id;
  f.poA = (await first("insert into public.erp_purchase_orders(company_id,project_id,po_number,amount_minor) values($1,$2,'PO-A',500000) returning id", [f.companyA, f.projectA])).id;
  for (const role of ['viewer', 'manager', 'admin']) await query('select * from public.erp_add_member($1,$2,$3)', [f.companyA, `${role}@example.test`, role]);
  await actAs(ids.ownerB, false);
  f.companyB = (await first("select * from public.erp_create_company('Empresa B')")).id;
  f.clientB = (await first("insert into public.erp_clients(company_id,name) values($1,'Cliente B') returning id", [f.companyB])).id;
  f.projectB = (await first("insert into public.erp_projects(company_id,client_id,name,sell_rate_minor) values($1,$2,'Proyecto B',10000) returning id", [f.companyB, f.clientB])).id;
  await db.exec('reset role');
}, { timeout: 30000 });
after(async () => { await db?.close(); });

dbTest('anonymous access is closed for tables and company/member RPCs', async () => {
  await db.exec('set local role anon');
  await fail('select * from public.erp_clients', [], ['42501']);
  await fail("select * from public.erp_create_company('Intrusión')", [], ['42501']);
  await fail('select * from public.erp_members($1)', [f.companyA], ['42501']);
});

dbTest('a signed-in outsider cannot read or mutate another company', async () => {
  await actAs(ids.outsider);
  assert.equal((await query('select * from public.erp_companies')).rows.length, 0);
  assert.equal((await query('select * from public.erp_clients')).rows.length, 0);
  await fail("insert into public.erp_clients(company_id,name) values($1,'Fuera')", [f.companyA], ['42501']);
  await fail('select * from public.erp_members($1)', [f.companyA], ['42501']);
  await fail("select * from public.erp_invoice_timesheets($1,$2,null,'2026-11','X',0,'2026-11-27','2026-12-27')", [f.companyA, f.projectA], ['42501']);
});

dbTest('tenant RLS filters reads, guessed IDs and writes in both companies', async () => {
  const clients = (await query('select * from public.erp_clients')).rows;
  assert.deepEqual(clients.map(r => r.id), [f.clientA]);
  assert.equal((await query("update public.erp_clients set name='No' where id=$1 returning id", [f.clientB])).rows.length, 0);
  assert.equal((await query('delete from public.erp_clients where id=$1 returning id', [f.clientB])).rows.length, 0);
  await fail("insert into public.erp_clients(company_id,name) values($1,'No')", [f.companyB], ['42501']);
  await actAs(ids.ownerB);
  assert.deepEqual((await query('select id from public.erp_clients')).rows.map(r => r.id), [f.clientB]);
});

dbTest('viewer can read company data but cannot insert, update, delete or manage users', async () => {
  await actAs(ids.viewer);
  assert.equal((await query('select * from public.erp_projects')).rows.length, 1);
  assert.equal((await query("update public.erp_clients set name='No' where id=$1 returning id", [f.clientA])).rows.length, 0);
  assert.equal((await query('delete from public.erp_purchase_orders where id=$1 returning id', [f.poA])).rows.length, 0);
  await fail("insert into public.erp_clients(company_id,name) values($1,'No')", [f.companyA], ['42501']);
  await fail("select * from public.erp_add_member($1,'outsider@example.test','manager')", [f.companyA], ['42501']);
  await fail("select * from public.erp_invoice_timesheets($1,$2,null,'2026-11','X',0,'2026-11-27','2026-12-27')", [f.companyA, f.projectA], ['42501']);
});

dbTest('managers edit operational data but cannot escalate membership or company settings', async () => {
  await actAs(ids.manager);
  assert.equal((await query("insert into public.erp_clients(company_id,name) values($1,'Permitido') returning name", [f.companyA])).rows[0].name, 'Permitido');
  assert.equal((await query("update public.erp_companies set name='No' where id=$1 returning id", [f.companyA])).rows.length, 0);
  await fail("update public.erp_company_members set role='owner' where user_id=$1", [ids.manager], ['42501']);
  await fail("select * from public.erp_add_member($1,'manager@example.test','admin')", [f.companyA], ['42501']);
});

dbTest('composite foreign keys prevent cross-tenant relationships', async () => {
  await fail("insert into public.erp_contacts(company_id,client_id,name) values($1,$2,'Cruce')", [f.companyA, f.clientB], ['23503']);
  await fail("insert into public.erp_projects(company_id,client_id,name) values($1,$2,'Cruce')", [f.companyA, f.clientB], ['23503']);
  await fail("insert into public.erp_purchase_orders(company_id,project_id,po_number,amount_minor) values($1,$2,'Cruce',1)", [f.companyA, f.projectB], ['23503']);
});

dbTest('a member of both companies still cannot move or rename record IDs', async () => {
  await actAs(ids.ownerB);
  await query("select * from public.erp_add_member($1,'ownera@example.test','manager')", [f.companyB]);
  await actAs(ids.ownerA);
  await fail('update public.erp_clients set company_id=$1 where id=$2', [f.companyB, f.clientA], ['23514']);
  await fail('update public.erp_clients set id=gen_random_uuid() where id=$1', [f.clientA], ['23514']);
});

dbTest('timesheets enforce assignment, date range, increments, uniqueness and invoice ownership', async () => {
  await part('2026-11-02');
  await fail("insert into public.erp_timesheets(company_id,project_id,consultant_id,work_date) values($1,$2,$3,'2026-11-02')", [f.companyA, f.projectA, f.consultantA], ['23505']);
  await fail("insert into public.erp_timesheets(company_id,project_id,consultant_id,work_date) values($1,$2,$3,'2026-11-03')", [f.companyA, f.projectA, f.consultantA2], ['23514']);
  await fail("insert into public.erp_timesheets(company_id,project_id,consultant_id,work_date) values($1,$2,$3,'2026-10-31')", [f.companyA, f.projectA, f.consultantA], ['23514']);
  await fail("insert into public.erp_timesheets(company_id,project_id,consultant_id,work_date,hours) values($1,$2,$3,'2026-11-03',0.249)", [f.companyA, f.projectA, f.consultantA], ['23514']);
  await fail("update public.erp_timesheets set status='invoiced' where company_id=$1", [f.companyA], ['23514']);
});

dbTest('child writes hold a project SHARE lock that conflicts with non-key project updates', async () => {
  await actAs(ids.manager);
  const attempts = [
    ['timesheet insert', () => part('2026-11-02')],
    ['invoice insert', () => invoice('LOCK-INVOICE')],
    ['purchase order insert', () => query("insert into public.erp_purchase_orders(company_id,project_id,po_number,amount_minor) values($1,$2,'LOCK-PO',1000)", [f.companyA, f.projectA])],
    ['purchase order update', () => query('update public.erp_purchase_orders set amount_minor=600000 where id=$1', [f.poA])],
    ['expense insert', () => query("insert into public.erp_expenses(company_id,project_id,description,amount_minor,expense_date) values($1,$2,'Lock check',100,'2026-11-27')", [f.companyA, f.projectA])],
  ];
  for (const [label, write] of attempts) {
    await db.exec('savepoint lock_check');
    const before = await first('select ctid::text as tid,xmax::text as xmax from public.erp_projects where id=$1', [f.projectA]);
    await write(); // All application mutations run as the restricted manager.
    await db.exec('reset role'); // Only page inspection requires the test superuser.
    const [block, line] = before.tid.slice(1, -1).split(',').map(Number);
    const locked = await first(`select h.t_xmax::text as xmax,f.combined_flags
      from heap_page_items(get_raw_page('public.erp_projects',$1::bigint)) h,
        lateral heap_tuple_infomask_flags(h.t_infomask,h.t_infomask2) f where h.lp=$2`, [block, line]);
    assert.notEqual(locked.xmax, before.xmax, `${label} must acquire a fresh transaction lock`);
    assert.ok(locked.combined_flags.includes('HEAP_XMAX_SHR_LOCK'), `${label} must hold SHARE, not only the FK's KEY SHARE`);
    await db.exec('rollback to savepoint lock_check; release savepoint lock_check');
  }
});

dbTest('project edits preserve document clients and registered timesheet dates and assignment', async () => {
  const otherClient = await first("insert into public.erp_clients(company_id,name) values($1,'Otro cliente') returning id", [f.companyA]);
  await fail('update public.erp_projects set client_id=$1 where id=$2', [otherClient.id, f.projectA], ['23514']);
  await fail("update public.erp_projects set currency_code='USD' where id=$1", [f.projectA], ['23514']);
  await part('2026-11-05');
  await fail("update public.erp_projects set start_date='2026-11-06' where id=$1", [f.projectA], ['23514']);
  await fail("update public.erp_projects set end_date='2026-11-04' where id=$1", [f.projectA], ['23514']);
  await fail('update public.erp_projects set consultant_id=$1 where id=$2', [f.consultantA2, f.projectA], ['23514']);
  await query("update public.erp_projects set end_date='2027-01-31' where id=$1", [f.projectA]);
});

dbTest('PostgreSQL rejects invalid money, currency, tax precision and dates', async () => {
  await fail("insert into public.erp_purchase_orders(company_id,project_id,po_number,amount_minor) values($1,$2,'NEG',-1)", [f.companyA, f.projectA], ['23514']);
  await fail("insert into public.erp_purchase_orders(company_id,project_id,po_number,amount_minor,currency_code) values($1,$2,'USD',1,'USD')", [f.companyA, f.projectA], ['23503']);
  await fail("insert into public.erp_invoices(company_id,project_id,invoice_number,issue_date,due_date,description,subtotal_minor,tax_rate) values($1,$2,'TAX','2026-11-27','2026-12-27','Test',100,21.001)", [f.companyA, f.projectA], ['23514']);
  await fail("insert into public.erp_invoices(company_id,project_id,invoice_number,issue_date,due_date,description,subtotal_minor,tax_rate) values($1,$2,'MAX','2026-11-27','2026-12-27','Test',1000000000000,21)", [f.companyA, f.projectA], ['23514']);
  await fail("insert into public.erp_contracts(company_id,project_id,name,start_date,end_date) values($1,$2,'Test','2026-12-01','2026-11-01')", [f.companyA, f.projectA], ['23514']);
});

dbTest('invoice RPC bills only approved unbilled parts once and cancellation atomically frees them', async () => {
  const a = await part('2026-11-02', 1);
  const b = await part('2026-11-03', 0.25);
  await part('2026-11-04', 1, 'submitted');
  const row = await bill('AUTO-1', f.poA);
  assert.equal(Number(row.subtotal_minor), 62500);
  assert.equal(Number(row.tax_minor), 13125);
  assert.equal(Number(row.total_minor), 75625);
  const billed = (await query('select * from public.erp_timesheets where invoice_id=$1', [row.id])).rows;
  assert.deepEqual(new Set(billed.map(t => t.id)), new Set([a.id, b.id]));
  assert.ok(billed.every(t => t.status === 'invoiced'));
  await fail("select * from public.erp_invoice_timesheets($1,$2,$3,'2026-11','AUTO-2',21,'2026-11-27','2026-12-27')", [f.companyA, f.projectA, f.poA], ['22023']);
  await fail('update public.erp_timesheets set days=2 where id=$1', [a.id], ['23514']);
  await fail('delete from public.erp_timesheets where id=$1', [a.id], ['23514']);
  await fail('update public.erp_invoices set subtotal_minor=1 where id=$1', [row.id], ['23514']);
  await fail('delete from public.erp_invoices where id=$1', [row.id], ['23514']);
  await query("update public.erp_invoices set status='cancelled' where id=$1", [row.id]);
  assert.equal((await query("select * from public.erp_timesheets where id=any($1::uuid[]) and status='approved' and invoice_id is null", [[a.id, b.id]])).rows.length, 2);
  assert.equal(Number((await bill('AUTO-3', f.poA)).subtotal_minor), 62500);
  assert.equal((await first('select status from public.erp_invoices where id=$1', [row.id])).status, 'cancelled');
});

dbTest('failed billing rolls back the whole invoice-and-parts operation', async () => {
  const t = await part('2026-11-05', 1);
  await invoice('EXISTING');
  await fail("select * from public.erp_invoice_timesheets($1,$2,null,'2026-11','existing',21,'2026-11-27','2026-12-27')", [f.companyA, f.projectA], ['23505']);
  assert.equal((await first('select status from public.erp_timesheets where id=$1', [t.id])).status, 'approved');
  await query('update public.erp_purchase_orders set amount_minor=1 where id=$1', [f.poA]);
  await fail("select * from public.erp_invoice_timesheets($1,$2,$3,'2026-11','TOO-MUCH',21,'2026-11-27','2026-12-27')", [f.companyA, f.projectA, f.poA], ['23514']);
  assert.equal((await query("select * from public.erp_invoices where invoice_number='TOO-MUCH'")).rows.length, 0);
  assert.equal((await first('select invoice_id from public.erp_timesheets where id=$1', [t.id])).invoice_id, null);
});

dbTest('PO reservations use pretax totals, include drafts, and reject overspending', async () => {
  const a = await invoice('RESERVE-1', 400000, f.poA);
  await fail("insert into public.erp_invoices(company_id,project_id,purchase_order_id,invoice_number,issue_date,due_date,description,subtotal_minor) values($1,$2,$3,'RESERVE-2','2026-11-27','2026-12-27','Test',200000)", [f.companyA, f.projectA, f.poA], ['23514']);
  await fail('update public.erp_purchase_orders set amount_minor=100 where id=$1', [f.poA], ['23514']);
  await query("update public.erp_invoices set status='cancelled' where id=$1", [a.id]);
  const b = await invoice('RESERVE-2', 500000, f.poA);
  assert.equal(Number(b.total_minor), 605000); // Tax does not consume the PO's pretax ceiling.
});

dbTest('issued invoices are immutable and state transitions cannot reopen paid or cancelled invoices', async () => {
  const row = await invoice('IMMUTABLE', 101);
  assert.equal(Number(row.tax_minor), 21);
  await fail("update public.erp_invoices set status='paid' where id=$1", [row.id], ['23514']);
  await query("update public.erp_invoices set status='issued' where id=$1", [row.id]);
  await fail('update public.erp_invoices set subtotal_minor=999 where id=$1', [row.id], ['23514']);
  await fail('update public.erp_invoices set tax_minor=999 where id=$1', [row.id], ['428C9']);
  await fail('delete from public.erp_invoices where id=$1', [row.id], ['23514']);
  await query("update public.erp_invoices set status='paid' where id=$1", [row.id]);
  await fail("update public.erp_invoices set status='draft' where id=$1", [row.id], ['23514']);
});

dbTest('membership RPCs protect the owner and prevent administrator privilege escalation', async () => {
  await fail("select * from public.erp_add_member($1,'ownera@example.test','viewer')", [f.companyA], ['42501']);
  await fail('select public.erp_remove_member($1,$2)', [f.companyA, ids.ownerA], ['42501']);
  await fail('delete from public.erp_company_members where company_id=$1', [f.companyA], ['42501']);
  await actAs(ids.admin);
  await fail("select * from public.erp_add_member($1,'outsider@example.test','admin')", [f.companyA], ['42501']);
  await fail("select * from public.erp_add_member($1,'admin@example.test','viewer')", [f.companyA], ['42501']);
  await query("select * from public.erp_add_member($1,'outsider@example.test','viewer')", [f.companyA]);
  assert.equal((await first('select role from public.erp_company_members where company_id=$1 and user_id=$2', [f.companyA, ids.outsider])).role, 'viewer');
});

dbTest('Holded export ledger denies direct mutations and never reclaims uncertain or finished attempts', async () => {
  const row = await invoice('HOLDED-1');
  const hash = 'a'.repeat(64);
  const claimed = (await first('select public.erp_holded_claim($1,$2,$3) as result', [f.companyA, row.id, hash])).result;
  assert.equal(claimed.claimed, true);
  const repeat = (await first('select public.erp_holded_claim($1,$2,$3) as result', [f.companyA, row.id, 'b'.repeat(64)])).result;
  assert.equal(repeat.claimed, false);
  assert.equal(repeat.export.request_hash, hash);
  await fail("update public.erp_holded_exports set status='failed' where invoice_id=$1", [row.id], ['42501']);
  await fail('delete from public.erp_holded_exports where invoice_id=$1', [row.id], ['42501']);
  await fail("select * from public.erp_holded_finish($1,$2,$3,'succeeded','remote-1',null)", [f.companyA, row.id, 'b'.repeat(64)], ['23514']);
  await actAs(ids.manager);
  assert.equal((await query('select * from public.erp_holded_exports')).rows.length, 0);
  await fail('select public.erp_holded_claim($1,$2,$3)', [f.companyA, row.id, hash], ['42501']);
  await fail('update public.erp_invoices set subtotal_minor=999 where id=$1', [row.id], ['23514']);
  await actAs(ids.ownerA);
  await query("select * from public.erp_holded_finish($1,$2,$3,'succeeded','remote-1',null)", [f.companyA, row.id, hash]);
  assert.equal((await first('select holded_id from public.erp_invoices where id=$1', [row.id])).holded_id, 'remote-1');
  await fail("select * from public.erp_holded_finish($1,$2,$3,'failed',null,'TIMEOUT')", [f.companyA, row.id, hash], ['23514']);
  await fail("update public.erp_invoices set status='cancelled' where id=$1", [row.id], ['23514']);
});

dbTest('company bootstrap creates exactly one owner and no membership for other users', async () => {
  await actAs(ids.outsider);
  const company = await first("select * from public.erp_create_company('Nueva empresa','Nueva','TEST','IT','GBP','es-ES')");
  const members = (await query('select * from public.erp_members($1)', [company.id])).rows;
  assert.equal(members.length, 1);
  assert.equal(members[0].user_id, ids.outsider);
  assert.equal(members[0].role, 'owner');
  assert.deepEqual((await query('select id from public.erp_companies')).rows.map(c => c.id), [company.id]);
});
