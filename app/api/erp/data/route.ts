import { apiError, readDataset, requireCompany } from '@/lib/erp/server';
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('company_id') || '';
    const { supabase } = await requireCompany(request, id);
    return Response.json({ records: await readDataset(supabase, id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return apiError(e); }
}
