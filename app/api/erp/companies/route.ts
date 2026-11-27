import { ApiError, apiError, databaseError, readBody, requireUser } from '@/lib/erp/server';
import { companyInput } from '@/lib/erp/domain';
import type { RecordInput } from '@/lib/erp/types';
export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const body = await readBody(request);
    let input;
    try { input = companyInput(body as RecordInput); } catch (e) { throw new ApiError(400, (e as Error).message); }
    const { data, error } = await supabase.rpc('erp_create_company', { p_name: input.name, p_legal_name: input.legal_name, p_tax_id: input.tax_id, p_country_code: input.country_code, p_currency_code: input.currency_code, p_locale: input.locale });
    if (error) databaseError(error);
    return Response.json({ company: Array.isArray(data) ? data[0] : data }, { status: 201 });
  } catch (e) { return apiError(e); }
}
