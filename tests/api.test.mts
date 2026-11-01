/**
 * Cliente de la API (src/lib/booking-api.ts) con fetch simulado: cada fallo da un error real,
 * nunca datos de respaldo ni reservas inventadas; las reservas no se reintentan solas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importBookingApi, loadCodeGs, plain } from './helpers.mts';

const api = await importBookingApi('https://script.google.com/macros/s/TEST/exec');
const goodCatalog = plain(loadCodeGs().readCatalog());

let mode = '';
let calls = 0;
const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
(globalThis as any).fetch = async (_url: string, init: any) => {
  calls++;
  switch (mode) {
    case 'catalog': return json(goodCatalog);
    case 'catalog-old': { const { salon, ...rest } = goodCatalog; void salon; return json(rest); }
    case 'html': return new Response('<html>Inicia sesión</html>', { status: 200 });
    case 'server': return json({ ok: false, error: 'server', message: 'boom' });
    case 'busy': return json({ ok: false, error: 'busy' });
    case 'http500': return new Response('x', { status: 500 });
    case 'offline': throw new TypeError('Failed to fetch');
    case 'hang': return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    case 'nobooking': return json({ ok: true });
    case 'slot_taken': return json({ ok: false, error: 'slot_taken' });
    case 'notfound': return json({ ok: false, error: 'not_found' });
    case 'slots': return json({ slots: [{ time: '10:00', staffId: 'ana' }] });
  }
  throw new Error('modo desconocido ' + mode);
};
const setOnline = (online: boolean) => Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true });
setOnline(true);

async function rejectsWith(m: string, fn: () => Promise<unknown>, kind: string, maxCalls = 99) {
  mode = m; calls = 0;
  await assert.rejects(fn, (e: any) => e instanceof api.ApiError && e.kind === kind);
  assert.ok(calls <= maxCalls, `${calls} peticiones (máx. ${maxCalls})`);
}
const req = { serviceId: 'corte', staffId: 'any', date: '2026-11-11', time: '10:00', name: 'A', email: 'a@a.es', phone: '600000000', notes: '', lang: 'es' };
async function bookWith(m: string) { mode = m; calls = 0; return { res: await api.book(req), calls }; }

test('catálogo: Apps Script devuelve HTML (implementación sin acceso público) → server', () => rejectsWith('html', () => api.getCatalog(), 'server'));
test('catálogo sin datos del salón (Code.gs antiguo) → server, sin respaldo local', () => rejectsWith('catalog-old', () => api.getCatalog(), 'server'));
test('catálogo: tras un fallo se vuelve a pedir y llega el de la hoja', async () => {
  mode = 'catalog';
  const cat = await api.getCatalog();
  assert.equal(cat.salon.name, 'Salón de Prueba');
  assert.equal(cat.services.length, goodCatalog.services.length);
});
test('huecos correctos', async () => { mode = 'slots'; assert.deepEqual(await api.getSlots('corte', 'any', '2026-11-11'), [{ time: '10:00', staffId: 'ana' }]); });
test('huecos: error de Apps Script → error (no «no quedan huecos»)', () => rejectsWith('server', () => api.getSlots('corte', 'any', '2026-11-11'), 'server'));
test('huecos: HTTP 500 → server', () => rejectsWith('http500', () => api.getSlots('corte', 'any', '2026-11-11'), 'server'));
test('huecos: sin conexión → network (1 reintento)', () => rejectsWith('offline', () => api.getSlots('corte', 'any', '2026-11-11'), 'network', 2));
test('huecos: Google no responde → timeout (1 reintento)', () => rejectsWith('hang', () => api.getSlots('corte', 'any', '2026-11-11'), 'timeout', 2));
test('huecos: hoja ocupada → busy', () => rejectsWith('busy', () => api.getSlots('corte', 'any', '2026-11-11'), 'busy'));

test('reservar: hora ya cogida → slot_taken', async () => assert.deepEqual((await bookWith('slot_taken')).res, { ok: false, error: 'slot_taken' }));
test('reservar: hoja ocupada → busy', async () => assert.deepEqual((await bookWith('busy')).res, { ok: false, error: 'busy' }));
test('reservar: error de Apps Script → server', async () => assert.deepEqual((await bookWith('server')).res, { ok: false, error: 'server' }));
test('reservar: navegador sin conexión → network (seguro que no se reservó)', async () => {
  setOnline(false);
  try { assert.deepEqual((await bookWith('offline')).res, { ok: false, error: 'network' }); } finally { setOnline(true); }
});
test('reservar: se corta con conexión → unknown (puede haberse guardado)', async () => assert.deepEqual((await bookWith('offline')).res, { ok: false, error: 'unknown' }));
test('reservar: timeout → unknown y SIN reintento (no duplica citas)', async () => {
  const { res, calls: n } = await bookWith('hang');
  assert.deepEqual(res, { ok: false, error: 'unknown' });
  assert.equal(n, 1);
});

test('ver cita: error de Apps Script → error (no «la cita no existe»)', () => rejectsWith('server', () => api.getBooking('A', 'B'), 'server'));
test('ver cita: respuesta sin el campo booking → server', () => rejectsWith('nobooking', () => api.getBooking('A', 'B'), 'server'));
test('cancelar: sin conexión → network, sin reintento', () => rejectsWith('offline', () => api.cancelBooking('A', 'B'), 'network', 1));
test('cancelar: cita inexistente → false', async () => { mode = 'notfound'; assert.equal(await api.cancelBooking('A', 'B'), false); });

test('sin PUBLIC_BOOKING_API_URL → config (no hay modo demo)', async () => {
  const noUrl = await importBookingApi('');
  await assert.rejects(() => noUrl.getSlots('corte', 'any', '2026-11-11'), (e: any) => e.kind === 'config');
});
