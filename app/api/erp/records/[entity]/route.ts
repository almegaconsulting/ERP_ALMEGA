import { ApiError, apiError, databaseError, readBody, readDataset, requireCompany, requireUuid } from '@/lib/erp/server';
import { validateRecord, validateRemoval } from '@/lib/erp/domain';
import { isEntity, type RecordInput } from '@/lib/erp/types';
type Context = { params: Promise<{ entity: string }> };
async function mutate(request: Request, context: Context, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    const { entity } = await context.params;
    if (!isEntity(entity)) throw new ApiError(404, 'Módulo no encontrado.');
    const body = await readBody(request);
    const companyId = body.company_id;
    requireUuid(companyId, 'Empresa');
    const { supabase } = await requireCompany(request, companyId, ['owner','admin','manager']);
    const data = await readDataset(supabase, companyId);
    if (method !== 'POST') requireUuid(body.id);
    const previous = method !== 'POST' ? data[entity].find(r => r.id === body.id) : undefined;
    if (method !== 'POST' && !previous) throw new ApiError(404, 'El registro ya no está disponible.');
    if (method === 'DELETE') {
      try { validateRemoval(entity, previous!, data); } catch (e) { throw new ApiError(409, (e as Error).message); }
      const removed = await supabase.from(`erp_${entity}`).delete().eq('company_id', companyId).eq('id', body.id).select('id').single();
      if (removed.error) databaseError(removed.error);
      return Response.json({ deleted: removed.data.id });
    }
    if (!body.values || typeof body.values !== 'object' || Array.isArray(body.values)) throw new ApiError(400, 'Faltan los datos del registro.');
    let values;
    try { values = validateRecord(entity, body.values as RecordInput, data, companyId, previous); } catch (e) { throw new ApiError(400, (e as Error).message); }
    const result = method === 'POST'
      ? await supabase.from(`erp_${entity}`).insert({ ...values, company_id: companyId }).select().single()
      : await supabase.from(`erp_${entity}`).update(values).eq('company_id', companyId).eq('id', body.id).select().single();
    if (result.error) databaseError(result.error);
    return Response.json({ record: result.data }, { status: method === 'POST' ? 201 : 200 });
  } catch (e) { return apiError(e); }
}
export const POST = (r: Request, c: Context) => mutate(r, c, 'POST');
export const PATCH = (r: Request, c: Context) => mutate(r, c, 'PATCH');
export const DELETE = (r: Request, c: Context) => mutate(r, c, 'DELETE');
