/**
 * Disponibilidad: Apps Script (la que usa la web) y su copia en booking-core.ts deben dar
 * exactamente los mismos huecos. Respeta duración, descansos, profesionales, días, citas y cierres.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableSlots } from '../src/lib/booking-core.ts';
import { loadCodeGs, plain } from './helpers.mts';

const NOW = { date: '2026-11-02', minutes: 600 }; // lunes 2/11/2026 10:00
const WED = '2026-11-11'; // miércoles: trabajan Ana, Bea y Cris
const gs = loadCodeGs(undefined, NOW);
const cat = plain(gs.readCatalog());

const bk = (date: string, time: string, end: string, staffId: string, serviceId = 'corte', status = 'Confirmada') => ({
  code: 'X', token: 't', date, time, end, serviceId, staffId, name: 'a', email: 'a@a.es', phone: '',
  notes: '', lang: 'es', status, discount: 0, createdAt: ''
});

/** Huecos de los dos motores; falla si no coinciden. */
function slots(bookings: any[], service: string, staff: string, date = WED) {
  const web = availableSlots(cat, bookings, service, staff, date, NOW);
  const sheet = plain(gs.availableSlots(cat, bookings, service, staff, date));
  assert.deepEqual(web, sheet, 'booking-core.ts y Code.gs deben coincidir');
  return web;
}
const at = (s: any[], time: string) => s.find((x) => x.time === time);

test('corte de 75 min a las 10:00 → 10:30 y 11:00 ocupadas, 11:15 libre (hora exacta de fin)', () => {
  const s = slots([bk(WED, '10:00', '11:15', 'ana')], 'corte', 'ana');
  assert.equal(at(s, '10:30').staffId, null);
  assert.equal(at(s, '11:00').staffId, null);
  assert.equal(at(s, '11:15').staffId, 'ana');
});

test('la duración del servicio cuenta: 09:30 + 75 min choca con una cita a las 10:00', () => {
  const s = slots([bk(WED, '10:00', '11:15', 'ana')], 'corte', 'ana');
  assert.equal(at(s, '09:30').staffId, null);
});

test('sin citas solo hay horas de la rejilla (intervalo de 30 min)', () => {
  const s = slots([], 'corte', 'ana');
  assert.ok(s.length > 0);
  assert.ok(s.every((x: any) => /:(00|30)$/.test(x.time)));
});

test('descanso 14:00–15:00: ningún servicio lo pisa y la tarde empieza a las 15:00', () => {
  const s = slots([], 'corte', 'ana');
  for (const x of s) {
    const [h, m] = x.time.split(':').map(Number);
    const start = h * 60 + m;
    assert.ok(start + 75 <= 14 * 60 || start >= 15 * 60, `${x.time} pisa el descanso`);
  }
  assert.ok(at(s, '15:00'));
});

test('una hora de fin que choca con el descanso no se ofrece', () => {
  const s = slots([bk(WED, '13:45', '14:15', 'cris', 'cejas')], 'cejas', 'cris');
  assert.equal(at(s, '14:15'), undefined);
});

test('el cierre del salón limita: el último corte de 75 min empieza a las 18:30', () => {
  const s = slots([], 'corte', 'ana');
  assert.equal(s[s.length - 1].time, '18:30');
});

test('las citas de otra profesional no bloquean ni crean horas extra', () => {
  const s = slots([bk(WED, '10:00', '10:50', 'cris', 'semi')], 'corte', 'ana');
  assert.equal(at(s, '10:00').staffId, 'ana');
  assert.equal(at(s, '10:50'), undefined);
});

test('«Me da igual»: si una está ocupada, se asigna otra libre', () => {
  const s = slots([bk(WED, '10:00', '11:15', 'ana')], 'corte', 'any');
  assert.equal(at(s, '10:00').staffId, 'bea');
});

test('una cita cancelada libera el hueco', () => {
  const s = slots([bk(WED, '10:00', '11:15', 'ana', 'corte', 'Cancelada')], 'corte', 'ana');
  assert.equal(at(s, '10:00').staffId, 'ana');
});

test('días de trabajo: Ana no trabaja los lunes y Cris no trabaja los martes', () => {
  assert.deepEqual(slots([], 'corte', 'ana', '2026-11-09'), []);
  assert.deepEqual(slots([], 'cejas', 'cris', '2026-11-10'), []);
});

test('festivo de la pestaña Cierres → sin huecos', () => {
  assert.deepEqual(slots([], 'corte', 'any', '2026-12-08'), []);
});

test('domingo (sin horario) → sin huecos', () => {
  assert.deepEqual(slots([], 'corte', 'any', '2026-11-08'), []);
});

test('antelación mínima de 2 h: hoy a las 10:00 no se ofrece nada antes de las 12:00', () => {
  const s = slots([], 'corte', 'bea', NOW.date);
  assert.ok(s.length > 0);
  assert.ok(s.every((x: any) => x.time >= '12:00'));
});

test('más allá de dias_reserva (30) → sin huecos', () => {
  assert.deepEqual(slots([], 'corte', 'any', '2026-12-30'), []);
});

test('Code.gs: una cita añadida a mano sin profesional bloquea a todas', () => {
  const s = plain(gs.availableSlots(cat, [bk(WED, '10:00', '11:00', '')], 'corte', 'any', WED));
  assert.equal(at(s, '10:00').staffId, null);
});
