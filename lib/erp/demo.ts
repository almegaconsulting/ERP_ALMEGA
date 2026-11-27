import { emptyDataset, type AppState, type Company, type Entity, type EntityRecord, type RecordInput } from './types';
import { invoiceTotals, today } from './domain';

// Every name and amount here is fictional. Demo records never enter Supabase.
export function createDemoState(date = today()): AppState {
  const stamp = `${date}T10:00:00.000Z`;
  const month = date.slice(0, 7);
  const companies: Company[] = [
    { id: crypto.randomUUID(), name: 'Almega · Pruebas', legal_name: 'Empresa de demostración', tax_id: '', country_code: 'ES', currency_code: 'EUR', locale: 'es-ES', created_at: stamp },
    { id: crypto.randomUUID(), name: 'Almega Internacional · Pruebas', legal_name: 'Empresa internacional de demostración', tax_id: '', country_code: 'GB', currency_code: 'GBP', locale: 'es-ES', created_at: stamp },
  ];
  const records = emptyDataset();
  const add = (entity: Entity, values: RecordInput, companyId = companies[0].id): EntityRecord => {
    const row: EntityRecord = { id: crypto.randomUUID(), company_id: companyId, created_at: stamp, updated_at: stamp, ...values };
    records[entity].push(row); return row;
  };
  const client1 = add('clients', { name: 'Atlas Logistics · Demo', email: 'equipo@atlas.example', phone: '', tax_id: '', country_code: 'ES', currency_code: 'EUR', payment_terms_days: 45, status: 'active', holded_contact_id: null, notes: 'Datos ficticios para explorar la aplicación.' });
  const client2 = add('clients', { name: 'Nexo Digital · Demo', email: 'equipo@nexo.example', phone: '', tax_id: '', country_code: 'FR', currency_code: 'EUR', payment_terms_days: 30, status: 'active', holded_contact_id: null, notes: '' });
  const client3 = add('clients', { name: 'Northstar Services · Demo', email: 'equipo@northstar.example', phone: '', tax_id: '', country_code: 'GB', currency_code: 'GBP', payment_terms_days: 30, status: 'active', holded_contact_id: null, notes: '' });
  const consultant1 = add('consultants', { full_name: 'Clara Martín · Demo', email: 'clara@example.com', profile: 'Business Analyst', country_code: 'ES', currency_code: 'EUR', cost_rate_minor: 34000, status: 'active', notes: '' });
  const consultant2 = add('consultants', { full_name: 'Luca Rossi · Demo', email: 'luca@example.com', profile: 'Consultor WMS', country_code: 'IT', currency_code: 'EUR', cost_rate_minor: 41000, status: 'active', notes: '' });
  const consultant3 = add('consultants', { full_name: 'Emma Wilson · Demo', email: 'emma@example.com', profile: 'Project Manager', country_code: 'GB', currency_code: 'GBP', cost_rate_minor: 36000, status: 'active', notes: '' });
  const p1 = add('projects', { name: 'Transformación logística', client_id: client1.id, consultant_id: consultant1.id, currency_code: 'EUR', sell_rate_minor: 52000, cost_rate_minor: 34000, status: 'active', start_date: `${month}-01`, end_date: null, description: 'Proyecto de ejemplo para recorrer el ciclo completo.' });
  const p2 = add('projects', { name: 'Evolución plataforma WMS', client_id: client2.id, consultant_id: consultant2.id, currency_code: 'EUR', sell_rate_minor: 65000, cost_rate_minor: 41000, status: 'active', start_date: `${month}-01`, end_date: null, description: '' });
  const p3 = add('projects', { name: 'Cloud delivery UK', client_id: client3.id, consultant_id: consultant3.id, currency_code: 'GBP', sell_rate_minor: 55000, cost_rate_minor: 36000, status: 'planned', start_date: `${month}-01`, end_date: null, description: 'Los importes en GBP se muestran separados de EUR.' });
  const po1 = add('purchase_orders', { po_number: 'DEMO-PO-001', project_id: p1.id, currency_code: 'EUR', amount_minor: 3000000, start_date: `${month}-01`, end_date: null, status: 'active', notes: '' });
  const po2 = add('purchase_orders', { po_number: 'DEMO-PO-002', project_id: p2.id, currency_code: 'EUR', amount_minor: 4000000, start_date: `${month}-01`, end_date: null, status: 'active', notes: '' });
  for (const [i, project, po, base, status] of [[1,p1,po1,1040000,'paid'],[2,p2,po2,1300000,'issued']] as const) {
    add('invoices', { invoice_number: `DEMO-${date.slice(0,4)}-00${i}`, project_id: project.id, purchase_order_id: po.id, currency_code: 'EUR', issue_date: `${month}-01`, due_date: `${month}-${i === 1 ? '15' : '20'}`, description: 'Servicios de consultoría — ejemplo', ...invoiceTotals(base, 21), tax_rate: 21, status, holded_id: null });
  }
  add('invoices', { invoice_number: 'DEMO-UK-001', project_id: p3.id, purchase_order_id: null, currency_code: 'GBP', issue_date: `${month}-01`, due_date: `${month}-28`, description: 'Servicio de ejemplo en GBP', ...invoiceTotals(550000, 0), tax_rate: 0, status: 'draft', holded_id: null });
  for (let i = 0; i < 6; i++) add('timesheets', { project_id: p1.id, consultant_id: consultant1.id, work_date: `${month}-${String(i + 2).padStart(2,'0')}`, hours: 8, days: 1, status: i < 4 ? 'approved' : 'submitted', invoice_id: null, notes: '' });
  for (let i = 0; i < 4; i++) add('timesheets', { project_id: p2.id, consultant_id: consultant2.id, work_date: `${month}-${String(i + 2).padStart(2,'0')}`, hours: 8, days: 1, status: i < 3 ? 'approved' : 'submitted', invoice_id: null, notes: '' });
  add('contacts', { name: 'Elena Torres · Demo', client_id: client1.id, email: 'elena@atlas.example', phone: '', position: 'Responsable de tecnología', status: 'active', notes: '' });
  for (const [name, client, amount, stage, probability] of [['Nueva operación europea',client1,4200000,'proposal',70],['Modernización de aplicaciones',client2,2800000,'qualified',40],['Service management UK',client3,1600000,'new',20]] as const) add('opportunities', { name, client_id: client.id, currency_code: client.currency_code, amount_minor: amount, stage, probability, expected_close_date: `${month}-28`, notes: '' });
  add('contracts', { name: 'Acuerdo de servicios · Demo', project_id: p1.id, start_date: `${month}-01`, end_date: `${month}-28`, notice_days: 15, status: 'active', notes: 'Solo registro de condiciones. Documento ficticio.' });
  add('expenses', { description: 'Equipo de trabajo · Demo', project_id: p1.id, currency_code: 'EUR', amount_minor: 24900, expense_date: `${month}-05`, category: 'equipment', status: 'approved', notes: '' });
  add('clients', { name: 'Harbour Digital · Demo', email: 'equipo@harbour.example', phone: '', tax_id: '', country_code: 'GB', currency_code: 'GBP', payment_terms_days: 30, status: 'active', holded_contact_id: null, notes: 'Este cliente solo aparece en la segunda empresa.' }, companies[1].id);
  return { companies, activeCompanyId: companies[0].id, records };
}
