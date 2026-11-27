import { apiError, databaseError, requireUser } from '@/lib/erp/server';
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser(request);
    const [companies, memberships] = await Promise.all([
      supabase.from('erp_companies').select('*').order('name'),
      supabase.from('erp_company_members').select('company_id,role').eq('user_id', user.id),
    ]);
    if (companies.error) databaseError(companies.error);
    if (memberships.error) databaseError(memberships.error);
    return Response.json({ companies: companies.data, memberships: memberships.data, email: user.email }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return apiError(e); }
}
