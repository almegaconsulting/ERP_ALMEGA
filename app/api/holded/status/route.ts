import { requireCompany } from '@/lib/erp/server';
import { companyApiKey, DRAFT_MODE_BLOCKER } from '@/lib/holded/config';
import { holdedCompanyId, holdedErrorResponse, holdedJson } from '@/lib/holded/http';

export async function GET(request: Request) {
  try {
    const companyId = holdedCompanyId(new URL(request.url).searchParams.get('company_id'));
    await requireCompany(request, companyId, ['owner', 'admin']);
    return holdedJson({ configured: Boolean(companyApiKey(companyId)), connectionVerified: false, apiVersion: 'v2', outboundEnabled: false, draftPreparation: true, blocker: DRAFT_MODE_BLOCKER });
  } catch (error) { return holdedErrorResponse(error); }
}
