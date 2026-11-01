/**
 * Cliente del motor de reservas (se ejecuta en el navegador).
 *
 * Habla SOLO con la aplicación web de Google Apps Script (apps-script/Code.gs),
 * cuya URL está en PUBLIC_BOOKING_API_URL. No hay modo demo ni datos de respaldo:
 * si algo falla se lanza un ApiError con el motivo real y la web lo muestra.
 */
import { addDays, nowInSalon, isOpen, staffFor, type Booking, type Catalog, type Lang, type Slot } from './booking-core';

const API_URL: string = (import.meta.env.PUBLIC_BOOKING_API_URL || '').trim();

// Limpieza: borra las citas de prueba que guardaba el antiguo modo demo en el navegador.
try { localStorage.removeItem('aurora-demo-bookings-v1'); } catch { /* sin localStorage */ }

/**
 * Motivos de error:
 *  - config  → falta PUBLIC_BOOKING_API_URL (la web está mal publicada)
 *  - network → no hay conexión con Google
 *  - timeout → Google no respondió a tiempo
 *  - busy    → la hoja estaba ocupada con otra reserva
 *  - server  → error de Apps Script o de la hoja (respuesta inválida, permisos…)
 */
export type ApiErrorKind = 'config' | 'network' | 'timeout' | 'busy' | 'server';
export class ApiError extends Error {
  kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, detail = '') {
    super(`[Aurora] ${kind}${detail ? ': ' + detail : ''}`);
    this.kind = kind;
  }
}

export interface BookingRequest {
  serviceId: string;
  staffId: string; // 'any' o id de profesional
  date: string;
  time: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  lang: Lang;
}

/**
 * 'unknown' = la petición de reserva se cortó o tardó demasiado: puede que la cita
 * SÍ se haya guardado. La web pide revisar el email antes de volver a intentarlo.
 */
export type BookError = 'slot_taken' | 'invalid' | 'busy' | 'server' | 'network' | 'unknown' | 'config';
export type BookResult = { ok: true; booking: Booking } | { ok: false; error: BookError };

const TIMEOUT_MS = 20000;

/* ---------------------------------------------------------------- transporte */

async function request(init: RequestInit, url: string): Promise<Record<string, unknown>> {
  if (!API_URL) throw new ApiError('config', 'PUBLIC_BOOKING_API_URL está vacía');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (ctrl.signal.aborted) throw new ApiError('timeout');
    throw new ApiError('network', String(err));
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new ApiError('server', 'HTTP ' + res.status);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    // Típico cuando la implementación de Apps Script no es pública: Google devuelve una página HTML de login.
    throw new ApiError('server', 'respuesta no JSON (¿implementación de Apps Script sin acceso «Cualquier usuario»?)');
  }
  if (!data || typeof data !== 'object') throw new ApiError('server', 'respuesta vacía');
  return data as Record<string, unknown>;
}

/** Error que Apps Script devuelve dentro del JSON ({ ok: false, error }). */
function serverError(data: Record<string, unknown>): ApiError | null {
  if (data.ok !== false) return null;
  return new ApiError(data.error === 'busy' ? 'busy' : 'server', String(data.message || data.error || ''));
}

/** Lecturas: un reintento automático si falla la conexión o Google tarda (son seguras de repetir). */
async function apiGet(params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = new URL(API_URL || 'https://invalid.local');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await request({ method: 'GET' }, url.toString());
      const err = serverError(data);
      if (err) throw err;
      return data;
    } catch (err) {
      last = err;
      const retry = err instanceof ApiError && (err.kind === 'network' || err.kind === 'timeout' || err.kind === 'busy');
      if (!retry) break;
    }
  }
  throw last;
}

/** Escrituras: SIN reintento automático, para no duplicar reservas. */
function apiPost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  // text/plain evita la petición previa CORS (preflight), que Apps Script no admite.
  return request({ method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }, API_URL);
}

/* ---------------------------------------------------------------- API pública */

let catalogCache: Promise<Catalog> | null = null;

/** Servicios, equipo, horarios y ajustes, leídos de la hoja. Si falla, lanza ApiError (y el siguiente intento vuelve a pedirlo). */
export function getCatalog(): Promise<Catalog> {
  if (!catalogCache) {
    catalogCache = apiGet({ action: 'catalog' }).then((data) => {
      const cat = data as unknown as Catalog;
      if (!Array.isArray(cat.services) || !Array.isArray(cat.staff) || !Array.isArray(cat.hours) || !cat.settings) {
        throw new ApiError('server', 'catálogo incompleto');
      }
      if (!cat.salon || !cat.salon.name || !cat.salon.phone || !cat.salon.address) {
        throw new ApiError('server', 'el catálogo no trae los datos del salón: actualiza apps-script/Code.gs y publica una nueva versión');
      }
      cat.closures = Array.isArray(cat.closures) ? cat.closures : [];
      return cat;
    });
    catalogCache.catch(() => { catalogCache = null; });
  }
  return catalogCache;
}

/** Días con el salón abierto y alguna profesional para ese servicio (los próximos N), según la hoja. */
export async function getBookableDays(serviceId: string, staffId: string, count = 14): Promise<string[]> {
  const cat = await getCatalog();
  const today = nowInSalon().date;
  const days: string[] = [];
  for (let i = 0; i <= cat.settings.bookingDays && days.length < count; i++) {
    const d = addDays(today, i);
    if (!isOpen(cat, d)) continue;
    const pros = staffFor(cat, serviceId, d).filter((s) => staffId === 'any' || s.id === staffId);
    if (pros.length) days.push(d);
  }
  return days;
}

export async function getSlots(serviceId: string, staffId: string, date: string): Promise<Slot[]> {
  const data = await apiGet({ action: 'slots', service: serviceId, staff: staffId, date });
  if (!Array.isArray(data.slots)) throw new ApiError('server', 'respuesta sin huecos');
  return data.slots as Slot[];
}

export async function book(req: BookingRequest): Promise<BookResult> {
  let data: Record<string, unknown>;
  try {
    data = await apiPost({ action: 'book', ...req });
  } catch (err) {
    const kind = err instanceof ApiError ? err.kind : 'network';
    console.error(err);
    if (kind === 'config' || kind === 'server') return { ok: false, error: kind };
    // Sin conexión antes de enviar → seguro que no se ha reservado.
    if (kind === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, error: 'network' };
    // Se cortó o tardó: Apps Script puede haber guardado la cita igualmente.
    return { ok: false, error: 'unknown' };
  }
  if (data.ok === true && data.booking) return { ok: true, booking: data.booking as Booking };
  const e = String(data.error || '');
  if (e === 'slot_taken' || e === 'invalid' || e === 'busy') return { ok: false, error: e };
  console.error('[Aurora] error al reservar', data);
  return { ok: false, error: 'server' };
}

/** La cita, o null si no existe. Si no se puede comprobar, lanza ApiError (no es lo mismo que «no existe»). */
export async function getBooking(code: string, token: string): Promise<Booking | null> {
  const data = await apiGet({ action: 'booking', code, token });
  if (!('booking' in data)) throw new ApiError('server', 'respuesta sin cita');
  return (data.booking as Booking | null) ?? null;
}

/** true = cancelada. Si falla, lanza ApiError; 'not_found' se devuelve como false. */
export async function cancelBooking(code: string, token: string): Promise<boolean> {
  const data = await apiPost({ action: 'cancel', code, token });
  if (data.ok === true) return true;
  if (data.error === 'not_found') return false;
  throw serverError(data) ?? new ApiError('server');
}
