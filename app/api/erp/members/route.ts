import { ApiError, apiError, databaseError, readBody, requireCompany, requireUuid } from '@/lib/erp/server';
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('company_id') || '';
    const { supabase } = await requireCompany(request, id);
    const { data, error } = await supabase.rpc('erp_members', { p_company_id: id });
    if (error) databaseError(error);
    return Response.json({ members: data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  try {
    const body = await readBody(request); requireUuid(body.company_id, 'Empresa');
    const { supabase } = await requireCompany(request, body.company_id, ['owner','admin']);
    if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || !['admin','manager','viewer'].includes(String(body.role))) throw new ApiError(400, 'Introduce un correo y un rol válidos.');
    const { data, error } = await supabase.rpc('erp_add_member', { p_company_id: body.company_id, p_email: body.email.trim().toLowerCase(), p_role: body.role });
    if (error) databaseError(error);
    return Response.json({ member: data });
  } catch (e) { return apiError(e); }
}
