import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { emptyDataset, entityNames, type Dataset, type Role } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'REQUEST_ERROR') { super(message); }
}
export function apiError(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ error: 'No se pudo completar la operación. Vuelve a intentarlo.', code: 'INTERNAL_ERROR' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}
export function requireUuid(value: unknown, label = 'Identificador'): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new ApiError(400, `${label} no válido.`);
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 30000) throw new ApiError(413, 'La solicitud es demasiado grande.');
  try { const body = JSON.parse(text); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); return body; }
  catch { throw new ApiError(400, 'La solicitud no tiene un formato válido.'); }
}
export async function requireUser(request: Request): Promise<{ supabase: SupabaseClient; user: User }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new ApiError(503, 'La conexión compartida todavía no está configurada.', 'NOT_CONFIGURED');
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.length < 20 || authorization.length > 10000) throw new ApiError(401, 'Inicia sesión para continuar.', 'UNAUTHORIZED');
  const token = authorization.slice(7);
  const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'La sesión ha caducado. Inicia sesión de nuevo.', 'UNAUTHORIZED');
  return { supabase, user: data.user };
}
export async function requireCompany(request: Request, companyId: string, roles?: readonly Role[]) {
  requireUuid(companyId, 'Empresa');
  const { supabase, user } = await requireUser(request);
  const { data, error } = await supabase.from('erp_company_members').select('role').eq('company_id', companyId).eq('user_id', user.id).maybeSingle();
  if (error) throw new ApiError(503, 'No se pudo comprobar el acceso. Revisa que la base de datos esté activada.', 'DATABASE_NOT_READY');
  if (!data || !['owner','admin','manager','viewer'].includes(data.role) || roles && !roles.includes(data.role as Role)) throw new ApiError(403, 'No tienes permiso para esta operación en esta empresa.', 'FORBIDDEN');
  return { supabase, user, role: data.role as Role };
}
export function databaseError(error: { code?: string; message?: string }): never {
  if (['55P03','40P01','40001'].includes(error.code ?? '')) throw new ApiError(409, 'Los datos están cambiando en otra operación. Vuelve a intentarlo.', 'CONCURRENT_CHANGE');
  if (error.code === '23505') throw new ApiError(409, 'Ya existe un registro con ese número o con esa combinación de datos.', 'DUPLICATE');
  if (error.code === '23503') throw new ApiError(409, 'Hay registros vinculados o una referencia pertenece a otra empresa.', 'REFERENCE_CONFLICT');
  if (error.code === '42501') throw new ApiError(403, 'No tienes permiso para modificar estos datos.', 'FORBIDDEN');
  if (error.code === 'P0001') {
    throw new ApiError(400, error.message?.slice(0, 240) || 'Los datos incumplen una regla de negocio.', 'BUSINESS_RULE');
  }
  const publicMessages = ['El usuario debe tener una cuenta creada antes de añadirlo.', 'Mes inválido: usa AAAA-MM.', 'No hay jornadas aprobadas pendientes de facturar en ese mes.'];
  if (error.code === '22023' && publicMessages.includes(error.message ?? '')) throw new ApiError(400, error.message!, 'BUSINESS_RULE');
  if (['23514','23502','22023','22P02','22007','22008','22003'].includes(error.code ?? '')) throw new ApiError(400, 'Los datos incumplen una regla de validación. Revisa los campos, las fechas y los importes.', 'BUSINESS_RULE');
  throw new ApiError(503, 'No se pudo guardar o leer la información. Comprueba la conexión y la configuración de la base de datos.', 'DATABASE_ERROR');
}
export async function readDataset(supabase: SupabaseClient, companyId: string): Promise<Dataset> {
  const result = emptyDataset();
  await Promise.all(entityNames.map(async entity => {
    const rows = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data, error } = await supabase.from(`erp_${entity}`).select('*').eq('company_id', companyId).order('id').range(offset, offset + 999);
      if (error) databaseError(error);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) { result[entity] = rows; return; }
    }
    throw new ApiError(413, 'Este espacio supera el límite de carga de la versión inicial. Necesita paginación antes de seguir creciendo.', 'DATASET_LIMIT');
  }));
  return result;
}
