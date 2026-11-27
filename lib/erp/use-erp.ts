'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { companyInput, invoiceTotals, prepareTimesheetInvoice, validateRecord, validateRemoval, type TimesheetInvoiceInput } from './domain';
import { createDemoState } from './demo';
import { emptyDataset, entityNames, type AppState, type Company, type Dataset, type Entity, type EntityRecord, type Member, type RecordInput, type Role } from './types';

const STORAGE_KEY = 'almega-minierp-demo-v1';
const ACTIVE_KEY = 'almega-minierp-active-company';
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const live = configured && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true';
const initial = (): AppState => ({ companies: [], activeCompanyId: '', records: emptyDataset() });
const message = (e: unknown) => e instanceof Error ? e.message : 'No se pudo completar la operación.';

async function api<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/erp/${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo conectar con el espacio de trabajo.');
  return data as T;
}

export function useERP() {
  const [state, setState] = useState<AppState>(initial);
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState(live ? '' : 'Espacio de prueba');
  const [memberships, setMemberships] = useState<{ company_id: string; role: Role }[]>([]);
  const client = useRef<SupabaseClient | null>(null);
  const requestGeneration = useRef(0);
  const bootstrapGeneration = useRef(0);
  const sessionGeneration = useRef(0);
  const sessionUser = useRef<string | null>(null);

  const replace = useCallback((next: AppState) => { stateRef.current = next; setState(next); }, []);
  const commitDemo = useCallback((next: AppState) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...next })); }
    catch { throw new Error('El navegador no permite guardar más datos. Exporta una copia o libera espacio antes de continuar.'); }
    replace(next);
  }, [replace]);

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrate browser storage and Auth only after mounting; the server cannot read either source. */
  useEffect(() => {
    if (!live) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.version !== 1 || !Array.isArray(parsed.companies) || !entityNames.every(e => Array.isArray(parsed.records?.[e]))) throw new Error('Formato no compatible.');
          const next: AppState = { companies: parsed.companies, records: parsed.records, activeCompanyId: parsed.companies.some((c: Company) => c.id === parsed.activeCompanyId) ? parsed.activeCompanyId : parsed.companies[0]?.id ?? '' };
          replace(next);
        } else commitDemo(createDemoState());
      } catch (e) { setError(`No se pudo cargar la copia de prueba: ${message(e)} Puedes restablecerla desde Configuración.`); }
      setReady(true); return;
    }
    let mounted = true;
    let supabase: SupabaseClient;
    try { supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); }
    catch { setError('La conexión compartida tiene una configuración incorrecta. Revisa la URL y la clave pública del proyecto.'); setReady(true); return; }
    client.current = supabase;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        if (sessionUser.current !== (session?.user.id ?? null)) { ++sessionGeneration.current; ++requestGeneration.current; ++bootstrapGeneration.current; sessionUser.current = session?.user.id ?? null; }
        setToken(session?.access_token ?? null); setUserEmail(session?.user.email ?? '');
      }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setError('No se pudo recuperar la sesión. Inicia sesión de nuevo.');
      setToken(data.session?.access_token ?? null); setUserEmail(data.session?.user.email ?? ''); setReady(true);
    }).catch(() => { if (mounted) { setError('No se pudo conectar con el servicio de acceso.'); setReady(true); } });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [commitDemo, replace]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const loadData = useCallback(async (companyId: string, accessToken: string) => {
    const generation = ++requestGeneration.current; setLoading(true);
    try {
      const result = await api<{ records: Dataset }>(`data?company_id=${encodeURIComponent(companyId)}`, accessToken);
      if (generation === requestGeneration.current && stateRef.current.activeCompanyId === companyId) replace({ ...stateRef.current, records: result.records });
    } catch (e) {
      if (generation === requestGeneration.current) throw e;
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  }, [replace]);

  const bootstrap = useCallback(async (accessToken: string, preferredId?: string, expectedSession = sessionGeneration.current) => {
    if (expectedSession !== sessionGeneration.current) return;
    const generation = ++bootstrapGeneration.current;
    setLoading(true);
    try {
      const result = await api<{ companies: Company[]; memberships: { company_id: string; role: Role }[]; email: string }>('bootstrap', accessToken);
      if (generation !== bootstrapGeneration.current || expectedSession !== sessionGeneration.current) return;
      let selected = preferredId || stateRef.current.activeCompanyId;
      if (!selected) { try { selected = localStorage.getItem(ACTIVE_KEY) || ''; } catch { /* Browser storage is optional for live mode. */ } }
      const id = result.companies.some(c => c.id === selected) ? selected : result.companies[0]?.id ?? '';
      setMemberships(result.memberships); setUserEmail(result.email);
      replace({ companies: result.companies, activeCompanyId: id, records: emptyDataset() });
      if (id) await loadData(id, accessToken);
    } catch (e) {
      if (generation === bootstrapGeneration.current) throw e;
    } finally { if (generation === bootstrapGeneration.current) setLoading(false); }
  }, [loadData, replace]);

  /* eslint-disable react-hooks/set-state-in-effect -- Synchronize the external authenticated session and clear company data immediately when it ends. */
  useEffect(() => {
    if (!live || !ready) return;
    if (!token) { ++requestGeneration.current; ++bootstrapGeneration.current; replace(initial()); setMemberships([]); setLoading(false); return; }
    setError(null);
    bootstrap(token).catch(e => setError(message(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- These refs are cancellation counters, not DOM handles; cleanup must invalidate their current generations.
    return () => { ++bootstrapGeneration.current; ++requestGeneration.current; };
  }, [token, ready, bootstrap, replace]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const company = state.companies.find(c => c.id === state.activeCompanyId);
  const records = useMemo(() => Object.fromEntries(entityNames.map(entity => [entity, state.records[entity].filter(row => row.company_id === state.activeCompanyId)])) as Dataset, [state]);
  const role: Role = live ? memberships.find(m => m.company_id === state.activeCompanyId)?.role ?? 'viewer' : 'owner';
  const getAccessToken = useCallback(async () => {
    if (!live) return null;
    if (!client.current) throw new Error('La conexión compartida todavía no está disponible.');
    const session = sessionGeneration.current;
    const { data, error } = await client.current.auth.getSession();
    if (session !== sessionGeneration.current) throw new Error('La sesión ha cambiado. Vuelve a intentarlo.');
    if (error || !data.session) throw new Error('Inicia sesión para continuar.');
    return data.session.access_token;
  }, []);

  async function refresh() {
    setError(null);
    if (!live) return;
    const session = sessionGeneration.current;
    const generation = bootstrapGeneration.current;
    try {
      const currentToken = await getAccessToken();
      if (currentToken && generation === bootstrapGeneration.current && session === sessionGeneration.current) await bootstrap(currentToken, undefined, session);
    } catch (e) { if (session === sessionGeneration.current) setError(message(e)); }
  }
  function selectCompany(id: string) {
    if (!stateRef.current.companies.some(c => c.id === id)) return;
    setError(null); ++requestGeneration.current; ++bootstrapGeneration.current;
    const generation = bootstrapGeneration.current;
    if (!live) { try { commitDemo({ ...stateRef.current, activeCompanyId: id }); } catch (e) { setError(message(e)); } return; }
    replace({ ...stateRef.current, activeCompanyId: id, records: emptyDataset() });
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* Selection still works without local storage. */ }
    getAccessToken().then(t => { if (t && generation === bootstrapGeneration.current && stateRef.current.activeCompanyId === id) return loadData(id, t); }).catch(e => { if (generation === bootstrapGeneration.current) setError(message(e)); });
  }
  async function save(entity: Entity, input: RecordInput, id?: string): Promise<EntityRecord> {
    const snapshot = stateRef.current; const companyId = snapshot.activeCompanyId;
    if (!companyId) throw new Error('Crea o selecciona una empresa.');
    if (role === 'viewer') throw new Error('Tu perfil solo permite consultar información.');
    const previous = id ? snapshot.records[entity].find(r => r.id === id && r.company_id === companyId) : undefined;
    if (id && !previous) throw new Error('El registro ya no está disponible.');
    const values = validateRecord(entity, input, snapshot.records, companyId, previous);
    if (live) {
      const session = sessionGeneration.current;
      const accessToken = await getAccessToken();
      const result = await api<{ record: EntityRecord }>(`records/${entity}`, accessToken!, id ? 'PATCH' : 'POST', { company_id: companyId, id, values });
      if (session === sessionGeneration.current && stateRef.current.activeCompanyId === companyId) await loadData(companyId, accessToken!);
      return result.record;
    }
    const now = new Date().toISOString();
    const row: EntityRecord = { ...(previous ?? {}), ...values, id: id || crypto.randomUUID(), company_id: companyId, created_at: previous?.created_at || now, updated_at: now };
    if (entity === 'invoices') Object.assign(row, invoiceTotals(Number(row.subtotal_minor), Number(row.tax_rate)), { holded_id: previous?.holded_id ?? null });
    if (entity === 'timesheets') row.invoice_id = previous?.invoice_id ?? null;
    const nextRecords = { ...snapshot.records, [entity]: id ? snapshot.records[entity].map(r => r.id === id ? row : r) : [row, ...snapshot.records[entity]] };
    if (entity === 'invoices' && row.status === 'cancelled') nextRecords.timesheets = nextRecords.timesheets.map(r => r.invoice_id === row.id ? { ...r, status: 'approved', invoice_id: null, updated_at: now } : r);
    commitDemo({ ...snapshot, records: nextRecords }); return row;
  }
  async function remove(entity: Entity, id: string) {
    const snapshot = stateRef.current; const companyId = snapshot.activeCompanyId;
    if (role === 'viewer') throw new Error('Tu perfil solo permite consultar información.');
    const row = snapshot.records[entity].find(r => r.id === id && r.company_id === companyId);
    if (!row) throw new Error('El registro ya no está disponible.');
    validateRemoval(entity, row, snapshot.records);
    if (live) {
      const session = sessionGeneration.current;
      const accessToken = await getAccessToken();
      await api(`records/${entity}`, accessToken!, 'DELETE', { company_id: companyId, id });
      if (session === sessionGeneration.current && stateRef.current.activeCompanyId === companyId) await loadData(companyId, accessToken!); return;
    }
    commitDemo({ ...snapshot, records: { ...snapshot.records, [entity]: snapshot.records[entity].filter(r => r.id !== id) } });
  }
  async function createCompany(values: RecordInput) {
    const clean = companyInput(values);
    if (live) {
      const session = sessionGeneration.current;
      const generation = bootstrapGeneration.current;
      const accessToken = await getAccessToken();
      const result = await api<{ company: Company }>('companies', accessToken!, 'POST', clean);
      if (session === sessionGeneration.current && generation === bootstrapGeneration.current) await bootstrap(accessToken!, result.company.id, session);
      return result.company;
    }
    const nextCompany: Company = { ...clean, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    commitDemo({ ...stateRef.current, companies: [...stateRef.current.companies, nextCompany], activeCompanyId: nextCompany.id }); return nextCompany;
  }
  async function invoiceTimesheets(input: TimesheetInvoiceInput): Promise<EntityRecord> {
    const snapshot = stateRef.current; const companyId = snapshot.activeCompanyId;
    if (role === 'viewer') throw new Error('Tu perfil solo permite consultar información.');
    const prepared = prepareTimesheetInvoice(snapshot.records, companyId, input);
    if (live) {
      const session = sessionGeneration.current;
      const accessToken = await getAccessToken();
      const result = await api<{ record: EntityRecord }>('invoice-timesheets', accessToken!, 'POST', { ...input, company_id: companyId });
      if (session === sessionGeneration.current && stateRef.current.activeCompanyId === companyId) await loadData(companyId, accessToken!); return result.record;
    }
    const stamp = new Date().toISOString();
    const invoice: EntityRecord = { ...prepared.input, ...invoiceTotals(Number(prepared.input.subtotal_minor), Number(prepared.input.tax_rate)), id: crypto.randomUUID(), company_id: companyId, created_at: stamp, updated_at: stamp, holded_id: null };
    commitDemo({ ...snapshot, records: { ...snapshot.records, invoices: [invoice,...snapshot.records.invoices], timesheets: snapshot.records.timesheets.map(t => prepared.ids.includes(t.id) ? { ...t, status: 'invoiced', invoice_id: invoice.id, updated_at: stamp } : t) } });
    return invoice;
  }
  async function signIn(email: string, password: string) {
    if (!client.current) throw new Error('La conexión compartida todavía no está configurada.');
    setError(null);
    const { error } = await client.current.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error('No se pudo iniciar sesión. Revisa el correo y la contraseña.');
  }
  async function signOut() {
    if (!live) return;
    ++sessionGeneration.current; ++requestGeneration.current; ++bootstrapGeneration.current;
    const { error } = await client.current!.auth.signOut();
    if (error) { setError('No se pudo cerrar la sesión. Vuelve a intentarlo.'); return; }
    ++requestGeneration.current; ++bootstrapGeneration.current; replace(initial()); setToken(null); setError(null);
  }
  async function getMembers(): Promise<Member[]> {
    const companyId = stateRef.current.activeCompanyId;
    if (!live) return [{ user_id: 'demo-owner', company_id: companyId, role: 'owner', email: 'usuario@demo.example' }];
    const accessToken = await getAccessToken();
    return (await api<{ members: Member[] }>(`members?company_id=${encodeURIComponent(companyId)}`, accessToken!)).members;
  }
  async function addMember(email: string, memberRole: Role) {
    if (!live) throw new Error('Los usuarios compartidos se activan al conectar el espacio real.');
    const companyId = stateRef.current.activeCompanyId;
    const accessToken = await getAccessToken();
    await api('members', accessToken!, 'POST', { company_id: companyId, email, role: memberRole });
  }
  function resetDemo() { if (!live) { try { commitDemo(createDemoState()); setError(null); } catch (e) { setError(message(e)); } } }
  return { ready, loading, error, setError, configured, mode: live ? 'live' as const : 'demo' as const, authenticated: !live || Boolean(token), userEmail, role, companies: state.companies, company, activeCompanyId: state.activeCompanyId, records, selectCompany, save, remove, createCompany, signIn, signOut, refresh, invoiceTimesheets, resetDemo, getMembers, addMember, getAccessToken };
}
export type ERPController = ReturnType<typeof useERP>;
