import { requireCompany } from '@/lib/erp/server';
import type { Company, EntityRecord } from '@/lib/erp/types';
import { HoldedError, HoldedReadClient } from '@/lib/holded/client';
import { DRAFT_MODE_BLOCKER, requireHoldedKey } from '@/lib/holded/config';
import { holdedBody, holdedCompanyId, holdedErrorResponse, holdedJson } from '@/lib/holded/http';
import { prepareHoldedInvoice } from '@/lib/holded/preparation';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await holdedBody(request);
    const companyId = holdedCompanyId(body.company_id);
    const { supabase } = await requireCompany(request, companyId, ['owner', 'admin']);
    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HoldedError('INVALID_INVOICE', 'La factura no es válida.', 400);
    if (typeof body.tax_id !== 'string' || !body.tax_id.trim() || body.tax_id.length > 128) throw new HoldedError('HOLDED_TAX_REQUIRED', 'Selecciona un impuesto de Holded.', 422);
    const key = requireHoldedKey(companyId);
    const invoiceResult = await supabase.from('erp_invoices').select('*').eq('company_id', companyId).eq('id', id).maybeSingle();
    if (invoiceResult.error) throw new HoldedError('INVOICE_READ_FAILED', 'No se ha podido consultar la factura.', 503);
    if (!invoiceResult.data) throw new HoldedError('INVOICE_NOT_FOUND', 'No se ha encontrado esta factura en la empresa seleccionada.', 404);
    const invoice = invoiceResult.data as EntityRecord;
    const projectResult = await supabase.from('erp_projects').select('client_id').eq('company_id', companyId).eq('id', invoice.project_id).maybeSingle();
    if (projectResult.error || !projectResult.data) throw new HoldedError('PROJECT_NOT_FOUND', 'No se ha podido resolver el proyecto de la factura.', 422);
    const [clientResult, companyResult, exportResult] = await Promise.all([
      supabase.from('erp_clients').select('*').eq('company_id', companyId).eq('id', projectResult.data.client_id).maybeSingle(),
      supabase.from('erp_companies').select('*').eq('id', companyId).maybeSingle(),
      supabase.from('erp_holded_exports').select('status,holded_id').eq('company_id', companyId).eq('invoice_id', id).maybeSingle(),
    ]);
    if (clientResult.error || !clientResult.data || companyResult.error || !companyResult.data) throw new HoldedError('RELATED_DATA_UNAVAILABLE', 'No se han podido consultar los datos de cliente y empresa.', 503);
    if (exportResult.error) throw new HoldedError('HOLDED_SCHEMA_NOT_READY', 'El registro de exportaciones de Holded requiere configuración.', 503);
    if (exportResult.data) throw new HoldedError('HOLDED_EXPORT_EXISTS', 'Ya existe un intento de exportación. Revisa su estado antes de preparar otro.', 409);
    const remote = new HoldedReadClient(key);
    const localClient = clientResult.data as EntityRecord;
    const contactId = typeof localClient.holded_contact_id === 'string' ? localClient.holded_contact_id.trim() : '';
    // Validate the contact against this company's Holded account, not just a syntactically valid ID.
    const [taxes, holdedContact] = await Promise.all([remote.taxes(), remote.contact(contactId)]);
    const preparation = prepareHoldedInvoice(invoice, localClient, companyResult.data as Company, taxes, { taxId: body.tax_id, exchangeRate: typeof body.exchange_rate === 'number' ? body.exchange_rate : undefined });
    return holdedJson({ ...preparation, holdedContact, canSubmit: false, blocker: DRAFT_MODE_BLOCKER, sentToHolded: false });
  } catch (error) { return holdedErrorResponse(error); }
}
