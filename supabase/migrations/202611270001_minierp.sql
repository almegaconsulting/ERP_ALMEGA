-- MiniERP v1: isolated application tables; existing ERP/ConsultFlow tables are untouched.
-- Apply with the Supabase SQL editor or migration runner as the database owner.
begin;

create schema if not exists erp_private;
revoke all on schema erp_private from public;
grant usage on schema erp_private to authenticated;

create table public.erp_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 180),
  legal_name text not null default '' check (length(legal_name) <= 240),
  tax_id text not null default '' check (length(tax_id) <= 80),
  country_code text not null default 'ES' check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null default 'EUR' check (currency_code in ('EUR','USD','GBP','CHF','INR','PLN','SGD','CAD','JPY','CLP')),
  locale text not null default 'es-ES' check (length(locale) between 2 and 35),
  created_at timestamptz not null default now()
);

create table public.erp_company_members (
  company_id uuid not null references public.erp_companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner','admin','manager','viewer')),
  created_at timestamptz not null default now(),
  primary key (company_id,user_id)
);
create index erp_members_user_idx on public.erp_company_members(user_id,company_id);

-- SECURITY DEFINER is limited to membership reads, with a fixed empty search_path.
-- This avoids recursive membership policies; callers cannot supply another user ID.
create function erp_private.has_role(p_company_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.erp_company_members m
    where m.company_id = p_company_id and m.user_id = (select auth.uid()) and m.role = any(p_roles)
  );
$$;
revoke all on function erp_private.has_role(uuid,text[]) from public, anon;
grant execute on function erp_private.has_role(uuid,text[]) to authenticated;

create table public.erp_clients (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  name text not null check (length(btrim(name)) between 1 and 180),
  email text check (email is null or email = '' or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text check (length(phone) <= 80), tax_id text check (length(tax_id) <= 80),
  country_code text not null default 'ES' check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null default 'EUR' check (currency_code in ('EUR','USD','GBP','CHF','INR','PLN','SGD','CAD','JPY','CLP')),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  status text not null default 'active' check (status in ('active','inactive')),
  holded_contact_id text check (length(holded_contact_id) <= 128), notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id)
);

create table public.erp_contacts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  client_id uuid not null, name text not null check (length(btrim(name)) between 1 and 180),
  email text check (email is null or email = '' or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text check (length(phone) <= 80), position text check (length(position) <= 180),
  status text not null default 'active' check (status in ('active','inactive')), notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), foreign key(company_id,client_id) references public.erp_clients(company_id,id)
);

create table public.erp_opportunities (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  client_id uuid not null, name text not null check (length(btrim(name)) between 1 and 180),
  currency_code text not null default 'EUR' check (currency_code in ('EUR','USD','GBP','CHF','INR','PLN','SGD','CAD','JPY','CLP')),
  amount_minor bigint not null default 0 check (amount_minor between 0 and 1000000000000),
  probability integer not null default 25 check (probability between 0 and 100),
  stage text not null default 'new' check (stage in ('new','qualified','proposal','won','lost')),
  expected_close_date date, notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), foreign key(company_id,client_id) references public.erp_clients(company_id,id)
);

create table public.erp_consultants (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  full_name text not null check (length(btrim(full_name)) between 1 and 180),
  email text not null check (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  profile text check (length(profile) <= 240),
  country_code text not null default 'ES' check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null default 'EUR' check (currency_code in ('EUR','USD','GBP','CHF','INR','PLN','SGD','CAD','JPY','CLP')),
  cost_rate_minor bigint not null default 0 check (cost_rate_minor between 0 and 1000000000000),
  status text not null default 'active' check (status in ('active','inactive')), notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id)
);

create table public.erp_projects (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  client_id uuid not null, consultant_id uuid,
  name text not null check (length(btrim(name)) between 1 and 180),
  currency_code text not null default 'EUR' check (currency_code in ('EUR','USD','GBP','CHF','INR','PLN','SGD','CAD','JPY','CLP')),
  sell_rate_minor bigint not null default 0 check (sell_rate_minor between 0 and 1000000000000),
  cost_rate_minor bigint not null default 0 check (cost_rate_minor between 0 and 1000000000000),
  start_date date, end_date date, check (end_date is null or start_date is null or end_date >= start_date),
  status text not null default 'active' check (status in ('planned','active','on_hold','completed')),
  description text check (length(description) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,id,currency_code),
  foreign key(company_id,client_id) references public.erp_clients(company_id,id),
  foreign key(company_id,consultant_id) references public.erp_consultants(company_id,id)
);

create table public.erp_contracts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  project_id uuid not null, name text not null check (length(btrim(name)) between 1 and 180),
  start_date date not null, end_date date not null check (end_date >= start_date),
  notice_days integer not null default 15 check (notice_days between 0 and 365),
  status text not null default 'draft' check (status in ('draft','active','expired','terminated')),
  notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), foreign key(company_id,project_id) references public.erp_projects(company_id,id)
);

create table public.erp_purchase_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  project_id uuid not null, po_number text not null check (length(btrim(po_number)) between 1 and 100),
  currency_code text not null default 'EUR' check (currency_code in ('EUR','USD','GBP','CHF','INR','PLN','SGD','CAD','JPY','CLP')),
  amount_minor bigint not null check (amount_minor between 0 and 1000000000000),
  start_date date, end_date date, check (end_date is null or start_date is null or end_date >= start_date),
  status text not null default 'active' check (status in ('active','closed','cancelled')), notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,id,project_id,currency_code),
  foreign key(company_id,project_id,currency_code) references public.erp_projects(company_id,id,currency_code)
);
create unique index erp_po_number_unique on public.erp_purchase_orders(company_id,lower(btrim(po_number)));

create table public.erp_invoices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  project_id uuid not null, purchase_order_id uuid,
  invoice_number text not null check (length(btrim(invoice_number)) between 1 and 100),
  currency_code text not null default 'EUR' check (currency_code in ('EUR','USD','GBP','CHF','INR','PLN','SGD','CAD','JPY','CLP')),
  issue_date date not null, due_date date not null check (due_date >= issue_date),
  description text not null check (length(btrim(description)) between 1 and 5000),
  subtotal_minor bigint not null check (subtotal_minor between 0 and 1000000000000),
  tax_rate numeric not null default 0 check (tax_rate between 0 and 100 and tax_rate = round(tax_rate,2)),
  tax_minor bigint generated always as (round(subtotal_minor::numeric * tax_rate / 100)::bigint) stored,
  total_minor bigint generated always as (subtotal_minor + round(subtotal_minor::numeric * tax_rate / 100)::bigint) stored,
  check (subtotal_minor + round(subtotal_minor::numeric * tax_rate / 100)::bigint <= 1000000000000),
  status text not null default 'draft' check (status in ('draft','issued','paid','cancelled')),
  holded_id text check (length(holded_id) <= 128),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id),
  foreign key(company_id,project_id,currency_code) references public.erp_projects(company_id,id,currency_code),
  foreign key(company_id,purchase_order_id,project_id,currency_code) references public.erp_purchase_orders(company_id,id,project_id,currency_code)
);
create unique index erp_invoice_number_unique on public.erp_invoices(company_id,lower(btrim(invoice_number)));
create index erp_invoice_po_idx on public.erp_invoices(company_id,purchase_order_id);

create table public.erp_timesheets (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  project_id uuid not null, consultant_id uuid not null, work_date date not null,
  hours numeric not null default 8 check (hours between 0.25 and 24 and mod(hours,0.25) = 0),
  days numeric not null default 1 check (days between 0 and 3 and mod(days,0.125) = 0),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','invoiced')),
  invoice_id uuid, notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,project_id,consultant_id,work_date),
  check ((status = 'invoiced') = (invoice_id is not null)),
  foreign key(company_id,project_id) references public.erp_projects(company_id,id),
  foreign key(company_id,consultant_id) references public.erp_consultants(company_id,id),
  foreign key(company_id,invoice_id) references public.erp_invoices(company_id,id)
);
create index erp_timesheets_billable_idx on public.erp_timesheets(company_id,project_id,work_date) where status = 'approved' and invoice_id is null;

create table public.erp_expenses (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  project_id uuid not null, description text not null check (length(btrim(description)) between 1 and 5000),
  currency_code text not null default 'EUR' check (currency_code in ('EUR','USD','GBP','CHF','INR','PLN','SGD','CAD','JPY','CLP')),
  amount_minor bigint not null check (amount_minor between 0 and 1000000000000), expense_date date not null,
  category text not null default 'other' check (category in ('travel','equipment','services','other')),
  status text not null default 'draft' check (status in ('draft','approved','paid')), notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), foreign key(company_id,project_id,currency_code) references public.erp_projects(company_id,id,currency_code)
);

create table public.erp_holded_exports (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.erp_companies(id),
  invoice_id uuid not null, status text not null default 'pending' check (status in ('pending','succeeded','reconcile_required','failed')),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  holded_id text check (length(holded_id) <= 128), error_code text check (length(error_code) <= 80),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,invoice_id), foreign key(company_id,invoice_id) references public.erp_invoices(company_id,id),
  check (status <> 'succeeded' or holded_id is not null)
);

-- Apply tenant policies independently of API filtering. No anonymous table access.
alter table public.erp_companies enable row level security;
alter table public.erp_company_members enable row level security;
alter table public.erp_holded_exports enable row level security;
revoke all on public.erp_companies, public.erp_company_members, public.erp_holded_exports from public, anon, authenticated;
grant select on public.erp_companies, public.erp_company_members to authenticated;
grant update(name,legal_name,tax_id,country_code,currency_code,locale) on public.erp_companies to authenticated;
grant select on public.erp_holded_exports to authenticated;
create policy erp_companies_read on public.erp_companies for select to authenticated
  using (erp_private.has_role(id,array['owner','admin','manager','viewer']));
create policy erp_companies_update on public.erp_companies for update to authenticated
  using (erp_private.has_role(id,array['owner','admin'])) with check (erp_private.has_role(id,array['owner','admin']));
create policy erp_members_read on public.erp_company_members for select to authenticated
  using (erp_private.has_role(company_id,array['owner','admin','manager','viewer']));
create policy erp_exports_read on public.erp_holded_exports for select to authenticated
  using (erp_private.has_role(company_id,array['owner','admin']));

do $$
declare entity text;
begin
  foreach entity in array array['clients','contacts','opportunities','consultants','projects','contracts','purchase_orders','timesheets','invoices','expenses'] loop
    execute format('alter table public.erp_%I enable row level security',entity);
    execute format('revoke all on public.erp_%I from public, anon, authenticated',entity);
    execute format('grant select, insert, update, delete on public.erp_%I to authenticated',entity);
    execute format('create index erp_%s_company_idx on public.erp_%I(company_id)',entity,entity);
    execute format('create policy tenant_read on public.erp_%I for select to authenticated using (erp_private.has_role(company_id,array[''owner'',''admin'',''manager'',''viewer'']))',entity);
    execute format('create policy tenant_insert on public.erp_%I for insert to authenticated with check (erp_private.has_role(company_id,array[''owner'',''admin'',''manager'']))',entity);
    execute format('create policy tenant_update on public.erp_%I for update to authenticated using (erp_private.has_role(company_id,array[''owner'',''admin'',''manager''])) with check (erp_private.has_role(company_id,array[''owner'',''admin'',''manager'']))',entity);
    execute format('create policy tenant_delete on public.erp_%I for delete to authenticated using (erp_private.has_role(company_id,array[''owner'',''admin'',''manager'']))',entity);
  end loop;
end $$;

-- IDs and tenant ownership cannot move after a record is created.
create function erp_private.guard_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.company_id <> old.company_id then
    raise exception 'El identificador y la empresa de un registro son inmutables.' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function erp_private.guard_record() from public, anon, authenticated;
do $$
declare entity text;
begin
  foreach entity in array array['clients','contacts','opportunities','consultants','projects','contracts','purchase_orders','timesheets','invoices','expenses','holded_exports'] loop
    execute format('create trigger erp_immutable before update on public.erp_%I for each row execute function erp_private.guard_record()',entity);
  end loop;
end $$;

-- FK KEY SHARE locks permit non-key project updates. SHARE also protects the
-- business checks (client, assigned consultant and dates) until the child commits.
-- A child UPDATE already owns its row before its trigger runs; NOWAIT avoids a
-- cycle with billing, which takes the project lock before locking its timesheets.
create function erp_private.lock_project_document()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.erp_projects p where p.company_id = new.company_id and p.id = new.project_id for share nowait;
  return new;
exception when lock_not_available then
  raise exception 'El proyecto se está modificando en otra operación. Vuelve a intentarlo.' using errcode = '55P03';
end;
$$;
revoke all on function erp_private.lock_project_document() from public, anon, authenticated;
create trigger erp_project_lock before insert or update on public.erp_invoices for each row execute function erp_private.lock_project_document();
create trigger erp_project_lock before insert or update on public.erp_purchase_orders for each row execute function erp_private.lock_project_document();
create trigger erp_project_lock before insert or update on public.erp_expenses for each row execute function erp_private.lock_project_document();

-- Invoker-context guard distinguishes owner-owned RPC updates from direct client writes.
create function erp_private.guard_timesheet()
returns trigger language plpgsql set search_path = '' as $$
declare project public.erp_projects; trusted boolean;
begin
  trusted := current_user = pg_catalog.pg_get_userbyid((select c.relowner from pg_catalog.pg_class c where c.oid = 'public.erp_timesheets'::regclass));
  if tg_op = 'DELETE' then
    if old.invoice_id is not null then raise exception 'No se puede eliminar un parte facturado.' using errcode = '23514'; end if;
    return old;
  end if;
  if not trusted then
    if tg_op = 'INSERT' and (new.invoice_id is not null or new.status = 'invoiced') then
      raise exception 'La vinculación de partes se realiza al generar la factura.' using errcode = '23514';
    elsif tg_op = 'UPDATE' and (old.invoice_id is not null or new.invoice_id is distinct from old.invoice_id or new.status = 'invoiced') then
      raise exception 'No se puede modificar un parte facturado.' using errcode = '23514';
    end if;
  end if;
  select * into project from public.erp_projects p where p.company_id = new.company_id and p.id = new.project_id for share nowait;
  if project.consultant_id is not null and project.consultant_id <> new.consultant_id then
    raise exception 'El consultor no coincide con el asignado al proyecto.' using errcode = '23514';
  end if;
  if (project.start_date is not null and new.work_date < project.start_date) or (project.end_date is not null and new.work_date > project.end_date) then
    raise exception 'El día trabajado está fuera de las fechas del proyecto.' using errcode = '23514';
  end if;
  return new;
exception when lock_not_available then
  raise exception 'El proyecto se está modificando en otra operación. Vuelve a intentarlo.' using errcode = '55P03';
end;
$$;
revoke all on function erp_private.guard_timesheet() from public, anon, authenticated;
create trigger erp_timesheet_validation before insert or update or delete on public.erp_timesheets for each row execute function erp_private.guard_timesheet();

create function erp_private.guard_project()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.client_id is distinct from old.client_id or new.currency_code is distinct from old.currency_code) and (
    exists(select 1 from public.erp_invoices i where i.company_id=new.company_id and i.project_id=new.id) or
    exists(select 1 from public.erp_purchase_orders p where p.company_id=new.company_id and p.project_id=new.id) or
    exists(select 1 from public.erp_expenses e where e.company_id=new.company_id and e.project_id=new.id)
  ) then raise exception 'El proyecto tiene documentos vinculados; conserva su cliente y moneda.' using errcode='23514'; end if;
  if (new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date) and exists (
    select 1 from public.erp_timesheets t where t.company_id=new.company_id and t.project_id=new.id and
      ((new.start_date is not null and t.work_date<new.start_date) or (new.end_date is not null and t.work_date>new.end_date))
  ) then raise exception 'Las nuevas fechas excluyen partes ya registrados.' using errcode='23514'; end if;
  if new.consultant_id is distinct from old.consultant_id and new.consultant_id is not null and exists (
    select 1 from public.erp_timesheets t where t.company_id = new.company_id and t.project_id = new.id and t.consultant_id <> new.consultant_id
  ) then raise exception 'Hay partes registrados de otro consultor; conserva la asignación del proyecto.' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function erp_private.guard_project() from public, anon, authenticated;
create trigger erp_project_validation before update on public.erp_projects for each row execute function erp_private.guard_project();

create function erp_private.guard_purchase_order()
returns trigger language plpgsql set search_path = '' as $$
declare reserved numeric;
begin
  select coalesce(sum(i.subtotal_minor),0) into reserved from public.erp_invoices i where i.company_id = new.company_id and i.purchase_order_id = new.id and i.status <> 'cancelled';
  if new.amount_minor < reserved then raise exception 'El presupuesto de la PO es inferior a las facturas reservadas.' using errcode = '23514'; end if;
  return new;
end;
$$;
revoke all on function erp_private.guard_purchase_order() from public, anon, authenticated;
create trigger erp_po_validation before update on public.erp_purchase_orders for each row execute function erp_private.guard_purchase_order();

-- A manager must not bypass a pending export lock merely because its ledger is admin-only.
create function erp_private.invoice_has_export(p_company_id uuid,p_invoice_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select erp_private.has_role(p_company_id,array['owner','admin','manager','viewer']) and exists(
    select 1 from public.erp_holded_exports e where e.company_id=p_company_id and e.invoice_id=p_invoice_id
  );
$$;
revoke all on function erp_private.invoice_has_export(uuid,uuid) from public, anon;
grant execute on function erp_private.invoice_has_export(uuid,uuid) to authenticated;

create function erp_private.guard_invoice()
returns trigger language plpgsql set search_path = '' as $$
declare po public.erp_purchase_orders; reserved numeric; trusted boolean; financial_changed boolean;
begin
  trusted := current_user = pg_catalog.pg_get_userbyid((select c.relowner from pg_catalog.pg_class c where c.oid = 'public.erp_invoices'::regclass));
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or erp_private.invoice_has_export(old.company_id,old.id) then
      raise exception 'Solo se pueden eliminar borradores sin exportación.' using errcode = '23514';
    end if;
    if exists(select 1 from public.erp_timesheets t where t.company_id=old.company_id and t.invoice_id=old.id) then
      raise exception 'Anula la factura para liberar sus partes antes de eliminarla.' using errcode='23514';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'Las facturas nuevas comienzan como borrador.' using errcode = '23514'; end if;
    if new.holded_id is not null and not trusted then raise exception 'El ID de Holded lo registra la integración.' using errcode = '23514'; end if;
    financial_changed := true;
  else
    financial_changed := row(new.project_id,new.purchase_order_id,new.invoice_number,new.currency_code,new.issue_date,new.due_date,new.description,new.subtotal_minor,new.tax_rate)
      is distinct from row(old.project_id,old.purchase_order_id,old.invoice_number,old.currency_code,old.issue_date,old.due_date,old.description,old.subtotal_minor,old.tax_rate);
    if new.holded_id is distinct from old.holded_id and not trusted then raise exception 'El ID de Holded lo registra la integración.' using errcode = '23514'; end if;
    if financial_changed and (old.status <> 'draft' or erp_private.invoice_has_export(old.company_id,old.id)) then
      raise exception 'Los importes y datos de una factura emitida o exportada son inmutables.' using errcode = '23514';
    end if;
    if exists(select 1 from public.erp_timesheets t where t.company_id=old.company_id and t.invoice_id=old.id) and row(new.project_id,new.currency_code,new.subtotal_minor) is distinct from row(old.project_id,old.currency_code,old.subtotal_minor) then
      raise exception 'La base y el proyecto de una factura vinculada a partes son inmutables; anúlala para regenerarla.' using errcode='23514';
    end if;
    if new.status='cancelled' and old.status<>'cancelled' and erp_private.invoice_has_export(old.company_id,old.id) then
      raise exception 'Revisa la exportación de Holded antes de anular esta factura.' using errcode='23514';
    end if;
    if new.status <> old.status and not (
      (old.status = 'draft' and new.status in ('issued','cancelled')) or
      (old.status = 'issued' and new.status in ('paid','cancelled'))
    ) then raise exception 'Transición de factura no permitida.' using errcode = '23514'; end if;
  end if;
  if new.purchase_order_id is not null and new.status <> 'cancelled' then
    select * into po from public.erp_purchase_orders p where p.company_id = new.company_id and p.id = new.purchase_order_id for update;
    if not found then raise exception 'PO no accesible o inexistente.' using errcode = '23503'; end if;
    if po.project_id <> new.project_id or po.currency_code <> new.currency_code then raise exception 'La factura y la PO deben pertenecer al mismo proyecto y moneda.' using errcode = '23514'; end if;
    if financial_changed and po.status <> 'active' then raise exception 'La PO no está activa.' using errcode = '23514'; end if;
    select coalesce(sum(i.subtotal_minor),0) into reserved from public.erp_invoices i where i.company_id = new.company_id and i.purchase_order_id = new.purchase_order_id and i.id <> new.id and i.status <> 'cancelled';
    if reserved + new.subtotal_minor > po.amount_minor then raise exception 'La factura supera el presupuesto disponible de la PO.' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
revoke all on function erp_private.guard_invoice() from public, anon, authenticated;
create trigger erp_invoice_validation before insert or update or delete on public.erp_invoices for each row execute function erp_private.guard_invoice();

-- Cancelling an invoice frees its timesheets within the same transaction.
create function erp_private.release_invoice_timesheets()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.erp_timesheets set status = 'approved', invoice_id = null where company_id = new.company_id and invoice_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function erp_private.release_invoice_timesheets() from public, anon, authenticated;
create trigger erp_invoice_cancelled after update on public.erp_invoices for each row execute function erp_private.release_invoice_timesheets();

create function public.erp_create_company(p_name text, p_legal_name text default '', p_tax_id text default '', p_country_code text default 'ES', p_currency_code text default 'EUR', p_locale text default 'es-ES')
returns public.erp_companies language plpgsql security definer set search_path = '' as $$
declare result public.erp_companies; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Debes iniciar sesión.' using errcode = '42501'; end if;
  insert into public.erp_companies(name,legal_name,tax_id,country_code,currency_code,locale)
    values (btrim(p_name),coalesce(p_legal_name,''),coalesce(p_tax_id,''),p_country_code,p_currency_code,p_locale) returning * into result;
  insert into public.erp_company_members(company_id,user_id,role) values(result.id,caller,'owner');
  return result;
end;
$$;

create function public.erp_members(p_company_id uuid)
returns table(user_id uuid,company_id uuid,role text,email text) language plpgsql security definer set search_path = '' as $$
begin
  if not erp_private.has_role(p_company_id,array['owner','admin','manager','viewer']) then raise exception 'No tienes acceso a esta empresa.' using errcode = '42501'; end if;
  return query select m.user_id,m.company_id,m.role,u.email::text from public.erp_company_members m join auth.users u on u.id=m.user_id where m.company_id=p_company_id order by m.created_at;
end;
$$;

create function public.erp_add_member(p_company_id uuid,p_email text,p_role text)
returns table(user_id uuid,company_id uuid,role text,email text) language plpgsql security definer set search_path = '' as $$
declare target uuid; existing_role text; caller_role text;
begin
  -- Serialize membership changes with the company row; lock before inspecting roles.
  perform 1 from public.erp_companies c where c.id=p_company_id for update;
  select m.role into caller_role from public.erp_company_members m where m.company_id=p_company_id and m.user_id=auth.uid();
  if caller_role is null or caller_role not in ('owner','admin') then raise exception 'Solo la administración puede gestionar usuarios.' using errcode = '42501'; end if;
  if p_role not in ('admin','manager','viewer') then raise exception 'Rol no permitido.' using errcode = '23514'; end if;
  select u.id into target from auth.users u where lower(u.email)=lower(btrim(p_email));
  if target is null then raise exception 'El usuario debe tener una cuenta creada antes de añadirlo.' using errcode = '22023'; end if;
  select m.role into existing_role from public.erp_company_members m where m.company_id=p_company_id and m.user_id=target;
  if existing_role = 'owner' then raise exception 'El propietario no puede cambiarse desde esta operación.' using errcode = '42501'; end if;
  if caller_role = 'admin' and (p_role='admin' or existing_role='admin') then raise exception 'Solo el propietario puede gestionar administradores.' using errcode = '42501'; end if;
  insert into public.erp_company_members(company_id,user_id,role) values(p_company_id,target,p_role)
    on conflict on constraint erp_company_members_pkey do update set role=excluded.role;
  return query select m.user_id,m.company_id,m.role,u.email::text from public.erp_company_members m join auth.users u on u.id=m.user_id where m.company_id=p_company_id and m.user_id=target;
end;
$$;

create function public.erp_remove_member(p_company_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role text; caller_role text;
begin
  perform 1 from public.erp_companies c where c.id=p_company_id for update;
  select m.role into caller_role from public.erp_company_members m where m.company_id=p_company_id and m.user_id=auth.uid();
  select m.role into target_role from public.erp_company_members m where m.company_id=p_company_id and m.user_id=p_user_id;
  if caller_role is null or caller_role not in ('owner','admin') or target_role='owner' or (caller_role='admin' and target_role='admin') then
    raise exception 'No puedes eliminar este miembro.' using errcode = '42501';
  end if;
  delete from public.erp_company_members m where m.company_id=p_company_id and m.user_id=p_user_id;
end;
$$;

create function public.erp_invoice_timesheets(
  p_company_id uuid,p_project_id uuid,p_purchase_order_id uuid,p_month text,p_invoice_number text,p_tax_rate numeric,p_issue_date date,p_due_date date
)
returns public.erp_invoices language plpgsql security definer set search_path = '' as $$
declare project public.erp_projects; result public.erp_invoices; selected_ids uuid[]; billable_days numeric; first_day date; subtotal numeric;
begin
  if not erp_private.has_role(p_company_id,array['owner','admin','manager']) then raise exception 'No tienes permiso para facturar.' using errcode = '42501'; end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mes inválido: usa AAAA-MM.' using errcode = '22023'; end if;
  first_day := (p_month || '-01')::date;
  select * into project from public.erp_projects p where p.company_id=p_company_id and p.id=p_project_id for update;
  if not found then raise exception 'Proyecto no accesible o inexistente.' using errcode = '42501'; end if;
  -- Project lock serializes bill runs; row locks prevent edits while collecting parts.
  select array_agg(t.id),coalesce(sum(t.days),0) into selected_ids,billable_days from (
    select x.id,x.days from public.erp_timesheets x where x.company_id=p_company_id and x.project_id=p_project_id
      and x.work_date>=first_day and x.work_date<(first_day+interval '1 month')
      and x.status='approved' and x.invoice_id is null order by x.id for update
  ) t;
  if selected_ids is null or billable_days <= 0 then raise exception 'No hay jornadas aprobadas pendientes de facturar en ese mes.' using errcode = '22023'; end if;
  subtotal := round(billable_days * project.sell_rate_minor);
  if subtotal <= 0 or subtotal > 1000000000000 then raise exception 'El importe calculado no es válido.' using errcode = '23514'; end if;
  insert into public.erp_invoices(company_id,project_id,purchase_order_id,invoice_number,currency_code,issue_date,due_date,description,subtotal_minor,tax_rate,status)
    values(p_company_id,p_project_id,p_purchase_order_id,btrim(p_invoice_number),project.currency_code,p_issue_date,p_due_date,'Servicios ' || p_month,subtotal::bigint,p_tax_rate,'draft') returning * into result;
  update public.erp_timesheets set invoice_id=result.id,status='invoiced' where id=any(selected_ids) and company_id=p_company_id;
  return result;
end;
$$;

-- Fail-closed export ledger: an existing claim is never automatically reused or deleted.
create function public.erp_holded_claim(p_company_id uuid,p_invoice_id uuid,p_request_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.erp_holded_exports; invoice public.erp_invoices; claimed boolean := false;
begin
  if not erp_private.has_role(p_company_id,array['owner','admin']) then raise exception 'Solo la administración puede exportar.' using errcode = '42501'; end if;
  select * into invoice from public.erp_invoices i where i.company_id=p_company_id and i.id=p_invoice_id for update;
  if not found then raise exception 'Factura no accesible o inexistente.' using errcode = '42501'; end if;
  if invoice.status='cancelled' then raise exception 'No se puede exportar una factura anulada.' using errcode = '23514'; end if;
  select * into result from public.erp_holded_exports e where e.company_id=p_company_id and e.invoice_id=p_invoice_id;
  if not found then
    insert into public.erp_holded_exports(company_id,invoice_id,request_hash) values(p_company_id,p_invoice_id,p_request_hash) returning * into result;
    claimed := true;
  end if;
  return jsonb_build_object('claimed',claimed,'export',to_jsonb(result));
end;
$$;

create function public.erp_holded_finish(p_company_id uuid,p_invoice_id uuid,p_request_hash text,p_status text,p_holded_id text default null,p_error_code text default null)
returns public.erp_holded_exports language plpgsql security definer set search_path = '' as $$
declare result public.erp_holded_exports;
begin
  if not erp_private.has_role(p_company_id,array['owner','admin']) then raise exception 'Solo la administración puede exportar.' using errcode = '42501'; end if;
  if p_status not in ('succeeded','reconcile_required','failed') then raise exception 'Estado de exportación no permitido.' using errcode = '23514'; end if;
  update public.erp_holded_exports e set status=p_status,holded_id=p_holded_id,error_code=p_error_code,updated_at=now()
    where e.company_id=p_company_id and e.invoice_id=p_invoice_id and e.request_hash=p_request_hash and e.status='pending' returning * into result;
  if not found then raise exception 'La exportación ya se cerró o no coincide con esta solicitud.' using errcode = '23514'; end if;
  if p_status='succeeded' then update public.erp_invoices i set holded_id=p_holded_id where i.company_id=p_company_id and i.id=p_invoice_id; end if;
  return result;
end;
$$;

-- Supabase functions are executable by PUBLIC unless revoked explicitly.
revoke all on function public.erp_create_company(text,text,text,text,text,text) from public, anon;
revoke all on function public.erp_members(uuid) from public, anon;
revoke all on function public.erp_add_member(uuid,text,text) from public, anon;
revoke all on function public.erp_remove_member(uuid,uuid) from public, anon;
revoke all on function public.erp_invoice_timesheets(uuid,uuid,uuid,text,text,numeric,date,date) from public, anon;
revoke all on function public.erp_holded_claim(uuid,uuid,text) from public, anon;
revoke all on function public.erp_holded_finish(uuid,uuid,text,text,text,text) from public, anon;
grant execute on function public.erp_create_company(text,text,text,text,text,text) to authenticated;
grant execute on function public.erp_members(uuid) to authenticated;
grant execute on function public.erp_add_member(uuid,text,text) to authenticated;
grant execute on function public.erp_remove_member(uuid,uuid) to authenticated;
grant execute on function public.erp_invoice_timesheets(uuid,uuid,uuid,text,text,numeric,date,date) to authenticated;
grant execute on function public.erp_holded_claim(uuid,uuid,text) to authenticated;
grant execute on function public.erp_holded_finish(uuid,uuid,text,text,text,text) to authenticated;

commit;
