/**
 * Datos de la web (navegador): UNA sola carga del catálogo de Google Sheets por página,
 * compartida por todas las secciones (contacto, servicios, equipo, regalo, reservas…).
 *
 * No hay datos locales de respaldo: mientras carga se ve «Cargando…»; si falla, cada
 * zona marcada muestra el error real con «Reintentar» y lo que depende de los datos
 * queda oculto.
 *
 * Atributos que entiende (en cualquier componente):
 *   data-salon="phone"          → texto con el dato del salón (ver `salonValue`)
 *   data-salon-href="tel"       → enlace: tel | mailto | instagram | maps
 *   data-salon-src="map"        → src del iframe de Google Maps
 *   data-salon-optional="email" → se oculta si ese dato está vacío en la hoja
 *   data-needs-data             → oculto hasta que los datos cargan bien
 *   data-data-status            → muestra «Cargando…» / error + «Reintentar»
 */
import { getCatalog, ApiError } from './booking-api';
import type { Catalog } from './booking-core';
import { esc } from './format';

type Listener = { ok: (cat: Catalog) => void; fail?: (err: unknown) => void; loading?: () => void };
const listeners: Listener[] = [];
let state: { status: 'idle' | 'loading' | 'ok' | 'error'; cat?: Catalog; err?: unknown } = { status: 'idle' };

/** Textos de carga y error en el idioma de la página (los escribe Base.astro). */
function dict(): Record<string, string> {
  const el = document.getElementById('site-i18n');
  try { return el ? JSON.parse(el.textContent || '{}') : {}; } catch { return {}; }
}
const t = (k: string) => dict()[k] ?? k;

/** Mensaje real según el motivo del fallo. */
export function errorText(err: unknown): string {
  const kind = err instanceof ApiError ? err.kind : 'network';
  return t(`err.${kind}`);
}

/** Valor de un dato del salón para mostrar. '' si no está en la hoja. */
export function salonValue(cat: Catalog, key: string): string {
  const s = cat.salon;
  switch (key) {
    case 'name': return s.name;
    case 'address': return s.address.split(/\s*·\s*/).join(', ');
    case 'phone': return s.phone;
    case 'email': return s.email;
    case 'instagram': return s.instagram;
    case 'legalName': return s.legalName || s.name;
    case 'cif': return s.cif;
    case 'registry': return s.registry;
    case 'discount': return String(cat.settings.newClientDiscount);
    default: return '';
  }
}
export const telHref = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '');
export const mapsQuery = (cat: Catalog) => cat.salon.address.split(/\s*·\s*/).join(', ');

function applyBindings(cat: Catalog) {
  document.querySelectorAll<HTMLElement>('[data-salon]').forEach((el) => {
    const key = el.dataset.salon!;
    if (key === 'addressLines') el.innerHTML = cat.salon.address.split(/\s*·\s*/).map(esc).join('<br />');
    else el.textContent = salonValue(cat, key);
  });
  document.querySelectorAll<HTMLAnchorElement>('[data-salon-href]').forEach((a) => {
    const kind = a.dataset.salonHref;
    const href =
      kind === 'tel' ? telHref(cat.salon.phone) :
      kind === 'mailto' ? (cat.salon.email ? 'mailto:' + cat.salon.email : '') :
      kind === 'instagram' ? cat.salon.instagram :
      kind === 'maps' ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapsQuery(cat)) : '';
    if (href) a.href = href; else a.removeAttribute('href');
  });
  document.querySelectorAll<HTMLIFrameElement>('[data-salon-src="map"]').forEach((f) => {
    const zoom = f.dataset.zoom || '16';
    const hl = document.documentElement.lang || 'es';
    f.src = `https://www.google.com/maps?q=${encodeURIComponent(mapsQuery(cat))}&z=${zoom}&output=embed&hl=${hl}`;
  });
  document.querySelectorAll<HTMLElement>('[data-salon-optional]').forEach((el) => {
    el.hidden = !salonValue(cat, el.dataset.salonOptional!);
  });
  const base = document.documentElement.dataset.titleSalon;
  if (base) document.title = `${base} — ${cat.salon.name}`;
}

function paintStatus() {
  document.querySelectorAll<HTMLElement>('[data-needs-data]').forEach((el) => { el.hidden = state.status !== 'ok'; });
  document.querySelectorAll<HTMLElement>('[data-data-status]').forEach((el) => {
    if (state.status === 'ok') { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = state.status === 'error'
      ? `<span class="data-status-msg" role="alert">${esc(t('data.error'))} ${esc(errorText(state.err))}</span>
         <button type="button" class="data-status-retry" data-data-retry>${esc(t('err.retry'))}</button>`
      : `<span class="data-status-msg">${esc(t('data.loading'))}</span>`;
  });
}

function load() {
  state = { status: 'loading' };
  paintStatus();
  listeners.forEach((l) => l.loading?.());
  getCatalog().then(
    (cat) => {
      state = { status: 'ok', cat };
      applyBindings(cat);
      paintStatus();
      listeners.forEach((l) => l.ok(cat));
    },
    (err) => {
      console.error(err);
      state = { status: 'error', err };
      paintStatus();
      listeners.forEach((l) => l.fail?.(err));
    }
  );
}

/** Suscribirse a los datos de la hoja. Si ya han cargado (o fallado), se llama al momento. */
export function onSiteData(l: Listener) {
  listeners.push(l);
  if (state.status === 'idle') load();
  else if (state.status === 'ok') l.ok(state.cat!);
  else if (state.status === 'error') l.fail?.(state.err);
  else l.loading?.();
}

/** Vuelve a pedir los datos (botón «Reintentar»). */
export function reloadSiteData() {
  if (state.status !== 'loading') load();
}

document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-data-retry]')) reloadSiteData();
});
