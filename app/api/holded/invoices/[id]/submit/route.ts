import { requireCompany } from '@/lib/erp/server';
import { DRAFT_MODE_BLOCKER } from '@/lib/holded/config';
import { holdedBody, holdedCompanyId, holdedErrorResponse, holdedJson } from '@/lib/holded/http';

/** Fail closed: no provider call or local export claim until draft-only creation can be guaranteed. */
export async function POST(request: Request) {
  try {
    const body = await holdedBody(request);
    const companyId = holdedCompanyId(body.company_id);
    await requireCompany(request, companyId, ['owner', 'admin']);
    return holdedJson({ error: DRAFT_MODE_BLOCKER, code: 'DRAFT_MODE_UNVERIFIED', sentToHolded: false }, 409);
  } catch (error) { return holdedErrorResponse(error); }
}
