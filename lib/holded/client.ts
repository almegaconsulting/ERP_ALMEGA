/** Holded API v2. Keep this adapter on the server; never pass its API key to a client. */
export const HOLDED_API_BASE = 'https://api.holded.com/api/v2/';

export class HoldedError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502) {
    super(message);
    this.name = 'HoldedError';
  }
}

export type HoldedContact = {
  id: string; name: string; email: string; tax_id: string; country_code: string;
};
export type HoldedTax = { id: string; name: string; rate: number | null; scope: string; active: boolean };
export type ContactPage = { items: HoldedContact[]; cursor: string | null; has_more: boolean };
type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): string => typeof value === 'string' ? value : '';
const contact = (item: unknown): HoldedContact => {
  if (!object(item) || !/^[0-9a-f]{24}$/i.test(string(item.id))) throw new HoldedError('HOLDED_INVALID_RESPONSE', 'Un contacto de Holded no tiene un identificador válido.');
  const address = object(item.bill_address) ? item.bill_address : {};
  // Deliberately omit bank details and all other fields irrelevant to contact matching.
  return { id: string(item.id), name: string(item.name), email: string(item.email), tax_id: string(item.code) || string(item.vat_number), country_code: string(address.country_code) };
};

/** No arbitrary URL, POST, redirect, or automatic retry is exposed by this client. */
export class HoldedReadClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 12_000,
  ) {
    if (!apiKey || /[\r\n]/.test(apiKey)) throw new HoldedError('HOLDED_NOT_CONFIGURED', 'La conexión de esta empresa con Holded no está configurada.', 503);
  }

  private async get(path: string, query?: URLSearchParams): Promise<JsonObject> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = new URL(path, HOLDED_API_BASE);
      if (query) url.search = query.toString();
      const response = await this.fetcher(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
        redirect: 'error',
      });
      if (!response.ok) {
        // Provider bodies can contain account information or echo request headers. Do not expose them.
        if (response.status === 401 || response.status === 403) throw new HoldedError('HOLDED_ACCESS_DENIED', 'Holded ha rechazado la conexión. Revisa la clave y sus permisos.');
        if (response.status === 429) throw new HoldedError('HOLDED_RATE_LIMIT', 'Holded ha limitado las consultas. Vuelve a intentarlo más tarde.', 503);
        if (response.status === 404) throw new HoldedError('HOLDED_NOT_FOUND', 'No se ha encontrado el registro en Holded.', 404);
        throw new HoldedError('HOLDED_UNAVAILABLE', 'No se ha podido consultar Holded. No se ha realizado ningún envío.');
      }
      const text = await response.text();
      if (text.length > 2_000_000) throw new HoldedError('HOLDED_INVALID_RESPONSE', 'La respuesta de Holded supera el tamaño admitido.');
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new HoldedError('HOLDED_INVALID_RESPONSE', 'Holded ha devuelto una respuesta no válida.'); }
      if (!object(parsed)) throw new HoldedError('HOLDED_INVALID_RESPONSE', 'Holded ha devuelto una respuesta no válida.');
      return parsed;
    } catch (error) {
      if (error instanceof HoldedError) throw error;
      if (controller.signal.aborted) throw new HoldedError('HOLDED_TIMEOUT', 'Holded no ha respondido a tiempo. No se ha realizado ningún envío.', 504);
      throw new HoldedError('HOLDED_UNAVAILABLE', 'No se ha podido conectar con Holded. No se ha realizado ningún envío.');
    } finally {
      clearTimeout(timer);
    }
  }

  async contacts(cursor?: string): Promise<ContactPage> {
    if (cursor && cursor.length > 2000) throw new HoldedError('INVALID_CURSOR', 'El cursor de paginación no es válido.', 400);
    const params = new URLSearchParams({ type: 'client', limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const response = await this.get('contacts', params);
    if (!Array.isArray(response.items) || typeof response.has_more !== 'boolean') throw new HoldedError('HOLDED_INVALID_RESPONSE', 'La lista de contactos de Holded no tiene el formato esperado.');
    const items = response.items.map(contact);
    const next = typeof response.cursor === 'string' && response.cursor ? response.cursor : null;
    if (response.has_more && !next) throw new HoldedError('HOLDED_INVALID_RESPONSE', 'Holded no ha facilitado el cursor para continuar la consulta.');
    return { items, cursor: next, has_more: response.has_more };
  }

  async contact(id: string): Promise<HoldedContact> {
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new HoldedError('HOLDED_CONTACT_REQUIRED', 'Vincula el cliente con un identificador de contacto válido de Holded.', 422);
    const found = contact(await this.get(`contacts/${encodeURIComponent(id)}`));
    if (found.id.toLowerCase() !== id.toLowerCase()) throw new HoldedError('HOLDED_INVALID_RESPONSE', 'Holded ha devuelto un contacto distinto del solicitado.');
    return found;
  }

  async taxes(): Promise<HoldedTax[]> {
    const response = await this.get('taxes');
    if (!Array.isArray(response.items)) throw new HoldedError('HOLDED_INVALID_RESPONSE', 'La lista de impuestos de Holded no tiene el formato esperado.');
    return response.items.map((item: unknown) => {
      if (!object(item) || !string(item.id)) throw new HoldedError('HOLDED_INVALID_RESPONSE', 'Un impuesto de Holded no tiene un identificador válido.');
      const rawAmount = typeof item.amount === 'string' ? item.amount.trim() : item.amount;
      const parsed = typeof rawAmount === 'number' || (typeof rawAmount === 'string' && /^-?\d+(\.\d+)?$/.test(rawAmount)) ? Number(rawAmount) : NaN;
      return { id: string(item.id), name: string(item.name), rate: Number.isFinite(parsed) ? parsed : null, scope: string(item.scope), active: item.status === true };
    });
  }
}
