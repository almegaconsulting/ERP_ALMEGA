import { requireCompany } from '@/lib/erp/server';
import { HoldedReadClient } from '@/lib/holded/client';
import { requireHoldedKey } from '@/lib/holded/config';
import { holdedCompanyId, holdedErrorResponse, holdedJson } from '@/lib/holded/http';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const companyId = holdedCompanyId(url.searchParams.get('company_id'));
    await requireCompany(request, companyId, ['owner', 'admin']);
    const client = new HoldedReadClient(requireHoldedKey(companyId));
    return holdedJson(await client.contacts(url.searchParams.get('cursor') || undefined));
  } catch (error) { return holdedErrorResponse(error); }
}
