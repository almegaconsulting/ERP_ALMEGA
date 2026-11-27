import type { Entity, EntitySpec, Field } from './types';

export const currencies = [
  { value: 'EUR', label: 'EUR · Euro' }, { value: 'USD', label: 'USD · Dólar estadounidense' },
  { value: 'GBP', label: 'GBP · Libra esterlina' }, { value: 'CHF', label: 'CHF · Franco suizo' },
  { value: 'INR', label: 'INR · Rupia india' }, { value: 'PLN', label: 'PLN · Zloty' },
  { value: 'SGD', label: 'SGD · Dólar de Singapur' }, { value: 'CAD', label: 'CAD · Dólar canadiense' },
  { value: 'JPY', label: 'JPY · Yen japonés' }, { value: 'CLP', label: 'CLP · Peso chileno' },
] as const;
export const countries = [
  ['ES', 'España'], ['IT', 'Italia'], ['FR', 'Francia'], ['PT', 'Portugal'], ['GB', 'Reino Unido'],
  ['DE', 'Alemania'], ['NL', 'Países Bajos'], ['BE', 'Bélgica'], ['CH', 'Suiza'], ['PL', 'Polonia'],
  ['AL', 'Albania'], ['RO', 'Rumanía'], ['UA', 'Ucrania'], ['IN', 'India'], ['PH', 'Filipinas'],
  ['SG', 'Singapur'], ['US', 'Estados Unidos'], ['CA', 'Canadá'], ['MX', 'México'], ['CL', 'Chile'],
  ['AR', 'Argentina'], ['BR', 'Brasil'], ['JP', 'Japón'], ['AU', 'Australia'], ['AE', 'Emiratos Árabes Unidos'],
].map(([value, label]) => ({ value, label }));
const options = (...values: [string, string][]) => values.map(([value, label]) => ({ value, label }));
const status = (values: [string, string][], initial: string): Field => ({ key: 'status', label: 'Estado', type: 'select', required: true, options: options(...values), default: initial });
const active = () => status([['active', 'Activo'], ['inactive', 'Inactivo']], 'active');
const currency: Field = { key: 'currency_code', label: 'Moneda', type: 'select', required: true, options: currencies, default: 'EUR' };
const country: Field = { key: 'country_code', label: 'País', type: 'select', required: true, options: countries, default: 'ES' };
const name: Field = { key: 'name', label: 'Nombre', type: 'text', required: true };
const email: Field = { key: 'email', label: 'Correo electrónico', type: 'email' };
const notes: Field = { key: 'notes', label: 'Notas', type: 'textarea' };
const ref = (key: string, label: string, entity: Entity, required = true): Field => ({ key, label, entity, type: 'reference', required });
const money = (key: string, label: string, required = true): Field => ({ key, label, type: 'money', required, min: 0, default: 0 });
const date = (key: string, label: string, required = false): Field => ({ key, label, type: 'date', required });

export const specs: Record<Entity, EntitySpec> = {
  clients: { label: 'Clientes', singular: 'cliente', description: 'Relaciones comerciales, condiciones y datos de facturación.', titleField: 'name', statusField: 'status',
    columns: ['name', 'email', 'country_code', 'currency_code', 'payment_terms_days', 'status'],
    fields: [name, email, { key: 'phone', label: 'Teléfono', type: 'text' }, { key: 'tax_id', label: 'Identificación fiscal', type: 'text' }, country, currency, { key: 'payment_terms_days', label: 'Plazo de pago (días)', type: 'number', required: true, min: 0, max: 365, step: 1, default: 30 }, active(), { key: 'holded_contact_id', label: 'ID del contacto en Holded', type: 'text' }, notes] },
  contacts: { label: 'Contactos', singular: 'contacto', description: 'Las personas con las que trabajas, vinculadas a cada cliente.', titleField: 'name', statusField: 'status',
    columns: ['name', 'client_id', 'email', 'position', 'phone', 'status'],
    fields: [name, ref('client_id', 'Cliente', 'clients'), email, { key: 'phone', label: 'Teléfono', type: 'text' }, { key: 'position', label: 'Cargo', type: 'text' }, active(), notes] },
  opportunities: { label: 'Oportunidades', singular: 'oportunidad', description: 'Tu actividad comercial, desde el primer contacto hasta el cierre.', titleField: 'name', statusField: 'stage',
    columns: ['name', 'client_id', 'amount_minor', 'probability', 'expected_close_date', 'stage'],
    fields: [name, ref('client_id', 'Cliente', 'clients'), currency, money('amount_minor', 'Importe estimado'), { key: 'probability', label: 'Probabilidad (%)', type: 'number', required: true, min: 0, max: 100, step: 1, default: 25 }, { key: 'stage', label: 'Fase', type: 'select', required: true, default: 'new', options: options(['new', 'Nueva'], ['qualified', 'Cualificada'], ['proposal', 'Propuesta'], ['won', 'Ganada'], ['lost', 'Perdida']) }, date('expected_close_date', 'Cierre previsto'), notes] },
  consultants: { label: 'Consultores', singular: 'consultor', description: 'Tu equipo de especialistas y sus tarifas de referencia.', titleField: 'full_name', statusField: 'status',
    columns: ['full_name', 'email', 'profile', 'country_code', 'cost_rate_minor', 'status'],
    fields: [{ ...name, key: 'full_name', label: 'Nombre y apellidos' }, { ...email, required: true }, { key: 'profile', label: 'Perfil profesional', type: 'text' }, country, currency, money('cost_rate_minor', 'Coste por jornada'), active(), notes] },
  projects: { label: 'Proyectos', singular: 'proyecto', description: 'Clientes, consultores y tarifas reunidos en un mismo lugar.', titleField: 'name', statusField: 'status',
    columns: ['name', 'client_id', 'consultant_id', 'sell_rate_minor', 'cost_rate_minor', 'status'],
    fields: [name, ref('client_id', 'Cliente', 'clients'), ref('consultant_id', 'Consultor', 'consultants', false), currency, money('sell_rate_minor', 'Tarifa de venta / jornada'), money('cost_rate_minor', 'Coste / jornada (misma moneda)'), date('start_date', 'Fecha de inicio'), date('end_date', 'Fecha de fin'), status([['planned', 'Planificado'], ['active', 'En curso'], ['on_hold', 'En pausa'], ['completed', 'Finalizado']], 'active'), { key: 'description', label: 'Descripción', type: 'textarea' }] },
  contracts: { label: 'Contratos', singular: 'contrato', description: 'Condiciones comerciales y vencimientos de tus servicios.', titleField: 'name', statusField: 'status',
    columns: ['name', 'project_id', 'start_date', 'end_date', 'notice_days', 'status'],
    fields: [name, ref('project_id', 'Proyecto', 'projects'), date('start_date', 'Fecha de inicio', true), date('end_date', 'Fecha de fin', true), { key: 'notice_days', label: 'Preaviso (días)', type: 'number', min: 0, max: 365, step: 1, default: 15, required: true }, status([['draft', 'Borrador'], ['active', 'Activo'], ['expired', 'Vencido'], ['terminated', 'Rescindido']], 'draft'), notes] },
  purchase_orders: { label: 'Pedidos de compra', singular: 'pedido', description: 'Presupuesto autorizado y consumo de cada PO, sin impuestos.', titleField: 'po_number', statusField: 'status',
    columns: ['po_number', 'project_id', 'amount_minor', 'start_date', 'end_date', 'status'],
    fields: [{ ...name, key: 'po_number', label: 'Número de PO' }, ref('project_id', 'Proyecto', 'projects'), currency, money('amount_minor', 'Presupuesto sin impuestos'), date('start_date', 'Fecha de inicio'), date('end_date', 'Fecha de fin'), status([['active', 'Activa'], ['closed', 'Cerrada'], ['cancelled', 'Cancelada']], 'active'), notes] },
  timesheets: { label: 'Partes de horas', singular: 'parte', description: 'Registra, revisa y aprueba el trabajo antes de facturarlo.', titleField: 'work_date', statusField: 'status',
    columns: ['work_date', 'consultant_id', 'project_id', 'hours', 'days', 'status'],
    fields: [ref('project_id', 'Proyecto', 'projects'), ref('consultant_id', 'Consultor', 'consultants'), date('work_date', 'Día trabajado', true), { key: 'hours', label: 'Horas', type: 'number', required: true, min: 0.25, max: 24, step: 0.25, default: 8 }, { key: 'days', label: 'Jornadas facturables', type: 'number', required: true, min: 0, max: 3, step: 0.125, default: 1 }, status([['draft', 'Borrador'], ['submitted', 'Pendiente de aprobación'], ['approved', 'Aprobado'], ['rejected', 'Rechazado']], 'draft'), notes] },
  invoices: { label: 'Facturas', singular: 'factura', description: 'Control de facturación, vencimientos y cobros por moneda.', titleField: 'invoice_number', statusField: 'status',
    columns: ['invoice_number', 'project_id', 'total_minor', 'issue_date', 'due_date', 'status'],
    fields: [{ ...name, key: 'invoice_number', label: 'Número de factura' }, ref('project_id', 'Proyecto', 'projects'), ref('purchase_order_id', 'Pedido de compra (opcional)', 'purchase_orders', false), currency, date('issue_date', 'Fecha de emisión', true), date('due_date', 'Fecha de vencimiento', true), { key: 'description', label: 'Concepto', type: 'textarea', required: true }, money('subtotal_minor', 'Base imponible'), { key: 'tax_rate', label: 'Impuesto (%)', type: 'number', required: true, min: 0, max: 100, step: 0.01, default: 0 }, status([['draft', 'Borrador'], ['issued', 'Emitida'], ['paid', 'Cobrada'], ['cancelled', 'Anulada']], 'draft')] },
  expenses: { label: 'Gastos', singular: 'gasto', description: 'Gastos de proyecto y su estado de aprobación y pago.', titleField: 'description', statusField: 'status',
    columns: ['description', 'project_id', 'category', 'amount_minor', 'expense_date', 'status'],
    fields: [{ key: 'description', label: 'Concepto', type: 'text', required: true }, ref('project_id', 'Proyecto', 'projects'), currency, money('amount_minor', 'Importe total del gasto'), date('expense_date', 'Fecha', true), { key: 'category', label: 'Categoría', type: 'select', required: true, default: 'other', options: options(['travel', 'Desplazamiento'], ['equipment', 'Equipamiento'], ['services', 'Servicios'], ['other', 'Otros']) }, status([['draft', 'Borrador'], ['approved', 'Aprobado'], ['paid', 'Pagado']], 'draft'), notes] },
};
