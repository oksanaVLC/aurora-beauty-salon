/**
 * Núcleo del motor de reservas: tipos y cálculo de huecos libres.
 *
 * Es código puro (sin DOM ni red). La web usa los tipos y las utilidades de fechas
 * (días abiertos, profesionales por día) con el catálogo que llega de la hoja.
 * Las horas libres las calcula SIEMPRE Apps Script (apps-script/Code.gs);
 * `availableSlots` es una copia exacta de esa lógica, útil para probarla en local.
 */

export type Lang = 'es' | 'en' | 'ru';
export type Localized = Record<Lang, string>;

export interface Service {
  id: string;
  name: Localized;
  desc: Localized;
  duration: number; // minutos
  price: number; // «desde», en euros
  visible: boolean;
  image?: string;
  imagePos?: string;
}

export interface Staff {
  id: string;
  name: string;
  role: Localized;
  services: string[]; // ids de servicio
  days: number[]; // 0 = domingo … 6 = sábado
}

export interface OpeningHours {
  day: number;
  open: string;
  close: string;
  breakStart?: string;
  breakEnd?: string;
}

export interface Settings {
  slotMinutes: number; // cada cuántos minutos empieza un hueco (además, se ofrece la hora exacta en que termina cada cita)
  bookingDays: number; // cuántos días hacia delante se puede reservar
  leadHours: number; // antelación mínima
  newClientDiscount: number; // %
}

/** Datos del salón (pestaña «Ajustes» de la hoja). Los opcionales llegan como '' si no están rellenos. */
export interface SalonInfo {
  name: string;
  address: string; // líneas separadas por « · »
  phone: string;
  email: string;
  instagram: string;
  legalName: string;
  cif: string;
  registry: string;
}

export interface Catalog {
  salon: SalonInfo;
  settings: Settings;
  services: Service[];
  staff: Staff[];
  hours: OpeningHours[];
  closures: string[]; // YYYY-MM-DD
}

export type BookingStatus = 'Confirmada' | 'Cancelada';

export interface Booking {
  code: string;
  token: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  end: string; // HH:MM
  serviceId: string;
  staffId: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  lang: Lang;
  status: BookingStatus;
  discount: number;
  createdAt: string;
}

export interface Slot {
  time: string;
  /** Profesional que hará la cita (útil con «Me da igual»). null = hueco ocupado. */
  staffId: string | null;
}

export const TIME_ZONE = 'Europe/Madrid';

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const toHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Día de la semana (0–6) de una fecha YYYY-MM-DD, sin depender de la zona horaria. */
export const weekday = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

/** Fecha y minuto actuales en la zona horaria del salón. */
export function nowInSalon(tz = TIME_ZONE): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Profesionales que hacen un servicio y trabajan ese día. */
export function staffFor(catalog: Catalog, serviceId: string, date?: string): Staff[] {
  const wd = date ? weekday(date) : -1;
  return catalog.staff.filter((s) => s.services.includes(serviceId) && (wd < 0 || s.days.includes(wd)));
}

/** ¿El salón abre ese día? */
export function isOpen(catalog: Catalog, date: string): boolean {
  if (catalog.closures.includes(date)) return false;
  return catalog.hours.some((h) => h.day === weekday(date));
}

/**
 * Huecos de un servicio en una fecha (libres y ocupados, para mostrarlos tachados).
 * staffId = 'any' → cualquier profesional; se asigna el primero libre.
 */
export function availableSlots(
  catalog: Catalog,
  bookings: Booking[],
  serviceId: string,
  staffId: string,
  date: string,
  now = nowInSalon()
): Slot[] {
  const service = catalog.services.find((s) => s.id === serviceId);
  if (!service || !isOpen(catalog, date)) return [];
  const hours = catalog.hours.find((h) => h.day === weekday(date))!;
  const { slotMinutes, leadHours, bookingDays } = catalog.settings;
  if (date < now.date || date > addDays(now.date, bookingDays)) return [];

  const candidates = staffFor(catalog, serviceId, date).filter((s) => staffId === 'any' || s.id === staffId);
  if (!candidates.length) return [];

  const open = toMin(hours.open);
  const close = toMin(hours.close);
  const bStart = hours.breakStart ? toMin(hours.breakStart) : -1;
  const bEnd = hours.breakEnd ? toMin(hours.breakEnd) : -1;
  const earliest = date === now.date ? now.minutes + leadHours * 60 : -1;

  const dayBookings = bookings.filter((b) => b.date === date && b.status !== 'Cancelada');
  const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

  const freeAt = (start: number) => {
    const end = start + service.duration;
    return candidates.find((s) =>
      !dayBookings.some((b) => b.staffId === s.id && overlaps(start, end, toMin(b.time), toMin(b.end)))
    );
  };
  const fits = (start: number) =>
    start >= open && start + service.duration <= close && start >= earliest &&
    !(bStart >= 0 && overlaps(start, start + service.duration, bStart, bEnd));

  // 1) Huecos de la rejilla normal (cada slotMinutes). Los ocupados se muestran tachados.
  const slots = new Map<number, Slot>();
  for (let start = open; start + service.duration <= close; start += slotMinutes) {
    if (!fits(start)) continue;
    const free = freeAt(start);
    slots.set(start, { time: toHHMM(start), staffId: free ? free.id : null });
  }

  // 2) Hora exacta en la que termina cada cita de estas profesionales (p. ej. 11:15).
  //    La duración del servicio ya incluye limpieza y preparación, así que la siguiente
  //    clienta puede empezar justo ahí. Solo se añade si está libre (no se muestra tachada).
  const ids = new Set(candidates.map((s) => s.id));
  for (const b of dayBookings) {
    if (!ids.has(b.staffId)) continue;
    const start = toMin(b.end);
    if (slots.has(start) || !fits(start)) continue;
    const free = freeAt(start);
    if (free) slots.set(start, { time: toHHMM(start), staffId: free.id });
  }

  return [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 4): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

export const normEmail = (e: string) => e.trim().toLowerCase();
export const normPhone = (p: string) => p.replace(/[^\d+]/g, '').replace(/^00/, '+');

/** Cliente nuevo = ninguna cita anterior (no cancelada) con el mismo email o teléfono. */
export function isNewClient(bookings: Booking[], email: string, phone: string): boolean {
  const e = normEmail(email);
  const p = normPhone(phone);
  return !bookings.some((b) => b.status !== 'Cancelada' && (normEmail(b.email) === e || (p && normPhone(b.phone) === p)));
}
