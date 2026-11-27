import { HoldedError } from './client';

/** Called only from server Route Handlers. The raw environment value is never returned. */
export function companyApiKey(companyId: string, raw = process.env.HOLDED_API_KEYS_JSON): string | null {
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new HoldedError('HOLDED_CONFIG_INVALID', 'La configuración de Holded requiere revisión.', 503); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HoldedError('HOLDED_CONFIG_INVALID', 'La configuración de Holded requiere revisión.', 503);
  if (!Object.prototype.hasOwnProperty.call(parsed, companyId)) return null;
  const key = (parsed as Record<string, unknown>)[companyId];
  if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key) || key.length > 4096) throw new HoldedError('HOLDED_CONFIG_INVALID', 'La configuración de Holded requiere revisión.', 503);
  return key.trim();
}

export const DRAFT_MODE_BLOCKER = 'La creación en Holded está pendiente de verificar el modo borrador de la cuenta. La API puede aprobar facturas automáticamente según su configuración; esta versión solo consulta y prepara la exportación.';

export function requireHoldedKey(companyId: string): string {
  const key = companyApiKey(companyId);
  if (!key) throw new HoldedError('HOLDED_NOT_CONFIGURED', 'Falta activar la conexión de esta empresa con Holded.', 503);
  return key;
}
