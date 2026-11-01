/** Catálogo que Apps Script envía a la web: datos del salón y validación estricta (sin valores de respaldo). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureSheet, loadCodeGs, plain } from './helpers.mts';

test('el catálogo incluye los datos del salón leídos de Ajustes', () => {
  const cat = plain(loadCodeGs().readCatalog());
  assert.equal(cat.salon.name, 'Salón de Prueba');
  assert.equal(cat.salon.address, 'Calle Falsa, 1 · Ciudad de Prueba');
  assert.equal(cat.salon.phone, '+34 600 000 000');
  assert.equal(cat.salon.email, '', 'opcional vacío → cadena vacía, no un valor inventado');
  assert.deepEqual(cat.settings, { slotMinutes: 30, bookingDays: 30, leadHours: 2, newClientDiscount: 10 });
});

test('servicios, equipo activo, horarios con descanso y cierres salen de la hoja', () => {
  const cat = plain(loadCodeGs().readCatalog());
  const corte = cat.services.find((s: any) => s.id === 'corte');
  assert.deepEqual([corte.duration, corte.price, corte.image, corte.imagePos], [75, 30, 'a.jpg', '50% 30%']);
  assert.equal(cat.services.find((s: any) => s.id === 'corte45').name.en, 'Corte corto', 'sin traducción → texto en español de la hoja');
  assert.deepEqual(cat.staff.map((s: any) => s.id), ['ana', 'bea', 'cris'], 'la profesional con activo = NO no aparece');
  assert.deepEqual(cat.staff[0].days, [2, 3, 4, 5, 6]);
  assert.equal(cat.hours.length, 6, 'domingo vacío = cerrado');
  assert.deepEqual(cat.hours[0], { day: 1, open: '09:30', close: '20:00', breakStart: '14:00', breakEnd: '15:00' });
  assert.deepEqual(cat.closures, ['2026-12-08']);
});

for (const key of ['nombre_salon', 'direccion', 'telefono', 'intervalo_minutos', 'dias_reserva', 'antelacion_horas', 'descuento_nuevos']) {
  test(`falta el ajuste obligatorio «${key}» → error claro, sin respaldo`, () => {
    const sheet = fixtureSheet();
    delete sheet.settings[key];
    assert.throws(() => loadCodeGs(sheet).readCatalog(), new RegExp(key));
  });
}

test('ajuste numérico no válido → error', () => {
  const sheet = fixtureSheet();
  sheet.settings.intervalo_minutos = 'treinta';
  assert.throws(() => loadCodeGs(sheet).readCatalog(), /intervalo_minutos/);
});

test('servicio visible sin duración o sin precio → error (antes se convertía en 30 min / 0 €)', () => {
  const a = fixtureSheet(); a.rows.Servicios[0][7] = '';
  assert.throws(() => loadCodeGs(a).readCatalog(), /corte.*duracion_min/);
  const b = fixtureSheet(); b.rows.Servicios[0][8] = '';
  assert.throws(() => loadCodeGs(b).readCatalog(), /corte.*precio_desde/);
});

test('un servicio oculto (visible = NO) incompleto no rompe el catálogo', () => {
  const cat = plain(loadCodeGs().readCatalog());
  assert.equal(cat.services.find((s: any) => s.id === 'oculto').visible, false);
});

test('doGet catalog con la hoja mal configurada responde { ok: false, error: "server" } (la web muestra el error)', () => {
  const sheet = fixtureSheet();
  delete sheet.settings.telefono;
  const out = JSON.parse(loadCodeGs(sheet).doGet({ parameter: { action: 'catalog' } }).text);
  assert.equal(out.ok, false);
  assert.equal(out.error, 'server');
  assert.match(out.message, /telefono/);
});
