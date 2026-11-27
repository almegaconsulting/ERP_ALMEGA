import { ApiError, apiError, databaseError, readBody, readDataset, requireCompany, requireUuid } from '@/lib/erp/server';
import { prepareTimesheetInvoice, type TimesheetInvoiceInput } from '@/lib/erp/domain';
export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    requireUuid(body.company_id, 'Empresa');
    const { supabase } = await requireCompany(request, body.company_id, ['owner','admin','manager']);
    const data = await readDataset(supabase, body.company_id);
    const input = body as unknown as TimesheetInvoiceInput;
    try { prepareTimesheetInvoice(data, body.company_id, input); } catch (e) { throw new ApiError(400, (e as Error).message); }
    const result = await supabase.rpc('erp_invoice_timesheets', { p_company_id: body.company_id, p_project_id: input.project_id, p_purchase_order_id: input.purchase_order_id || null, p_month: input.month, p_invoice_number: input.invoice_number, p_tax_rate: input.tax_rate, p_issue_date: input.issue_date, p_due_date: input.due_date });
    if (result.error) databaseError(result.error);
    return Response.json({ record: Array.isArray(result.data) ? result.data[0] : result.data }, { status: 201 });
  } catch (e) { return apiError(e); }
}
