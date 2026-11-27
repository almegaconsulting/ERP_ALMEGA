import { apiError } from '../erp/server';
import { HoldedError } from './client';

export const holdedJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function holdedErrorResponse(error: unknown): Response {
  if (error instanceof HoldedError) return holdedJson({ error: error.message, code: error.code }, error.status);
  return apiError(error);
}

export function holdedCompanyId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new HoldedError('INVALID_COMPANY', 'Selecciona una empresa válida.', 400);
  return value;
}

export async function holdedBody(request: Request): Promise<Record<string, unknown>> {
  let result: unknown;
  try { result = await request.json(); } catch { throw new HoldedError('INVALID_BODY', 'La petición no contiene un JSON válido.', 400); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new HoldedError('INVALID_BODY', 'La petición no es válida.', 400);
  return result as Record<string, unknown>;
}
