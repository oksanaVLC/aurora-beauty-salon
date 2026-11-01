/**
 * Mejoras de apps-script/Code.gs: token con UUID, bloqueo liberado antes de los emails, validación del equipo,
 * descuento 0–100, longitudes máximas, freno ante avalanchas y nombre del salón en los emails.
 * Hoja FALSA en memoria (tests/fake-spreadsheet.mts): no se accede a Google.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, plain } from './helpers.mts';
import { FakeSheet, fixtureBook, loadWithBook } from './fake-spreadsheet.mts';

const NOW = { date: '2026-11-02', minutes: 600 };
const WED = '2026-11-11';
const req = (over: Record<string, unknown> = {}) => ({
  action: 'book', serviceId: 'corte45', staffId: 'ana', date: WED, time: '10:00',
  name: 'Clienta Prueba', email: 'clienta@prueba.test', phone: '+34 600 111 222', notes: '', lang: 'es', ...over
});
const src = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');

/* ------------------------------------------------------------------ 1. Token */
describe('1 · token de cancelación con Utilities.getUuid()', () => {
  test('el token tiene 32 caracteres hexadecimales y cambia en cada reserva', () => {
    const { gs } = loadWithBook(fixtureBook(), { now: NOW });
    const a = plain(gs.createBooking(req())).booking.token;
    const b = plain(gs.createBooking(req({ time: '11:00', email: 'otra@prueba.test' }))).booking.token;
    for (const t of [a, b]) assert.match(t, /^[0-9a-f]{32}$/);
    assert.notEqual(a, b);
  });
  test('el token no se genera con Math.random (randomCode)', () => {
    assert.match(src, /token: newToken\(\)/);
    assert.match(src, /function newToken\(\) \{ return Utilities\.getUuid\(\)/);
    assert.doesNotMatch(src, /token: randomCode/);
  });
  test('el código visible AUR-XXXX no se repite con uno que ya existe en la hoja', () => {
    const book = fixtureBook({}, [['AUR-AAAA', '2026-11-20', '10:00', '10:45', 'corte45', '', 'ana', '', 'C', 'c@c.es', '600000000', '', 'es', 'Confirmada', '', 'Web', '', 't']]);
    const { gs } = loadWithBook(book, { now: NOW });
    const seq = ['AAAA', 'AAAA', 'BBBB']; gs.randomCode = () => seq.shift();
    assert.equal(plain(gs.createBooking(req())).booking.code, 'AUR-BBBB');
  });
});

/* ------------------------------------------------------------------ 2. Bloqueo */
describe('2 · bloqueo: comprobación y escritura dentro, emails fuera', () => {
  const tracked = (opts: Parameters<typeof loadWithBook>[1] = {}) => {
    const book = fixtureBook();
    const env = loadWithBook(book, { now: NOW, ...opts });
    const citas = book.getSheetByName('Citas')!;
    const atWrite: boolean[] = [];
    const orig = citas.appendRow.bind(citas);
    citas.appendRow = (v: unknown[]) => { atWrite.push(env.lock.held); return orig(v); };
    return { ...env, book, atWrite };
  };
  test('la cita se escribe con el bloqueo puesto y los emails se envían ya liberado', () => {
    const { gs, atWrite, lockAtMail, mails, lock } = tracked();
    assert.equal(plain(gs.createBooking(req())).ok, true);
    assert.deepEqual(atWrite, [true], 'escritura dentro del bloqueo');
    assert.equal(mails.length, 2);
    assert.deepEqual(lockAtMail, [false, false], 'emails fuera del bloqueo');
    assert.equal(lock.held, false);
  });
  test('la espera máxima al bloqueo (10 s) es menor que el tiempo límite de la web (20 s)', () => {
    const { gs, lock } = tracked();
    gs.createBooking(req());
    const web = fs.readFileSync(path.join(root, 'src/lib/booking-api.ts'), 'utf8').match(/const TIMEOUT_MS = (\d+)/)![1];
    assert.equal(lock.lastWait, 10000);
    assert.ok(lock.lastWait < Number(web), `${lock.lastWait} < ${web}`);
  });
  test('slot_taken, invalid y busy: sin escritura, sin emails y bloqueo liberado', () => {
    const { gs, book, mails, lock } = tracked();
    gs.createBooking(req());
    const n = book.getSheetByName('Citas')!.data.length;
    mails.length = 0;
    assert.equal(plain(gs.createBooking(req({ email: 'otra@prueba.test' }))).error, 'slot_taken');
    assert.equal(plain(gs.createBooking(req({ serviceId: 'oculto', time: '12:00' }))).error, 'invalid');
    assert.equal(book.getSheetByName('Citas')!.data.length, n);
    assert.equal(mails.length, 0);
    assert.equal(lock.held, false);
  });
  test('dos reservas seguidas a la misma hora y profesional: la segunda recibe slot_taken (sin reserva doble)', () => {
    const { gs, book } = tracked();
    assert.equal(plain(gs.createBooking(req())).ok, true);
    assert.equal(plain(gs.createBooking(req({ email: 'b@prueba.test', phone: '600 222 333' }))).error, 'slot_taken');
    assert.equal(book.getSheetByName('Citas')!.data.filter((r) => r[2] === '10:00').length, 1);
  });
  test('si falla el email, la reserva sigue confirmada (respuesta ok, fila guardada)', () => {
    const { gs, book, errors } = tracked({ mailFails: () => true });
    assert.equal(plain(gs.createBooking(req())).ok, true);
    assert.equal(book.getSheetByName('Citas')!.data.length, 2);
    assert.ok(errors.some((e) => /Email no enviado/.test(e)));
  });
  test('cancelar: el estado se escribe con el bloqueo y el email se envía ya liberado', () => {
    const book = fixtureBook({}, [['AUR-AAAA', WED, '10:00', '10:45', 'corte45', '', 'ana', '', 'C', 'c@prueba.test', '600000000', '', 'es', 'Confirmada', '', 'Web', '', 'TOKA']]);
    const env = loadWithBook(book, { now: NOW });
    assert.deepEqual(plain(env.gs.cancelBooking('AUR-AAAA', 'TOKA')), { ok: true });
    assert.equal(book.getSheetByName('Citas')!.data[1][13], 'Cancelada');
    assert.ok(env.lockAtMail.length >= 1);
    assert.ok(env.lockAtMail.every((h) => h === false));
  });
  test('cancelar con fallo de email: la cancelación se mantiene', () => {
    const book = fixtureBook({}, [['AUR-AAAA', WED, '10:00', '10:45', 'corte45', '', 'ana', '', 'C', 'c@prueba.test', '600000000', '', 'es', 'Confirmada', '', 'Web', '', 'TOKA']]);
    const env = loadWithBook(book, { now: NOW, mailFails: () => true });
    assert.deepEqual(plain(env.gs.cancelBooking('AUR-AAAA', 'TOKA')), { ok: true });
    assert.equal(book.getSheetByName('Citas')!.data[1][13], 'Cancelada');
  });
});

/* ------------------------------------------------------------------ 3. Equipo */
describe('3 · validación del equipo', () => {
  // id, nombre, rol_es, rol_en, rol_ru, servicios, dias, activo
  const withStaff = (rows: unknown[][]) => { const b = fixtureBook(); b.sheets.set('Equipo', new FakeSheet('Equipo', [['id'], ...rows])); return loadWithBook(b, { now: NOW }).gs; };
  const pro = (id: string, days: unknown, active = 'SI', name = 'Pro ' + id) => [id, name, 'Estilista', '', '', 'corte', days, active];
  const daysOf = (days: unknown) => plain(withStaff([pro('x', days)]).readCatalog()).staff[0].days;

  for (const [text, want] of [
    ['mar, mie, jue, vie, sab', [2, 3, 4, 5, 6]], ['lunes-viernes', [1, 2, 3, 4, 5]], ['lun a vie', [1, 2, 3, 4, 5]],
    ['Lunes – Viernes', [1, 2, 3, 4, 5]], ['Monday to Friday', [1, 2, 3, 4, 5]], ['lun-mie, sab', [1, 2, 3, 6]],
    ['sab - dom', [6, 0]], ['miércoles; sábado', [3, 6]], ['Mié., Sáb.', [3, 6]], ['lun, lun-mar', [1, 2]],
  ] as [string, number[]][]) {
    test(`días «${text}» → ${JSON.stringify(want)}`, () => assert.deepEqual(daysOf(text), want));
  }
  const errs: [string, unknown[][], RegExp][] = [
    ['profesional activa sin id', [pro('', 'lun')], /Equipo, fila 2: falta el id de la profesional activa «Pro»/],
    ['profesional activa sin nombre', [pro('x', 'lun', 'SI', '')], /Equipo, fila 2: falta el nombre de la profesional «x»/],
    ['id repetido', [pro('x', 'lun'), pro('x', 'mar')], /Equipo, fila 3: el id «x» ya se usa en la fila 2/],
    ['día no reconocido', [pro('x', 'lun, lunez')], /Equipo, fila 2: el día «lunez» no se reconoce/],
    ['palabra que solo empieza como un día', [pro('x', 'lunático')], /el día «lunático» no se reconoce/],
    ['rango al revés', [pro('x', 'vie-lun')], /Equipo, fila 2: el rango de días «vie-lun» está al revés/],
    ['rango con un día desconocido', [pro('x', 'lun-xyz')], /el rango de días «lun-xyz» tiene un día no reconocido/],
    ['sin días de trabajo', [pro('x', '')], /Equipo, fila 2: «Pro x» no tiene días de trabajo/],
  ];
  for (const [label, rows, msg] of errs) test(label, () => assert.throws(() => withStaff(rows).readCatalog(), msg));

  test('las profesionales inactivas no se validan ni aparecen', () => {
    const cat = plain(withStaff([pro('x', 'lun'), pro('', 'cualquier cosa', 'NO'), pro('x', 'lun', 'NO')]).readCatalog());
    assert.deepEqual(cat.staff.map((s: any) => s.id), ['x']);
  });
});

/* ------------------------------------------------------------------ 4. Descuento */
describe('4 · descuento_nuevos entre 0 y 100', () => {
  const disc = (v: unknown) => plain(loadWithBook(fixtureBook({ descuento_nuevos: v })).gs.readCatalog()).settings.newClientDiscount;
  for (const v of [0, 10, 100, '15']) test(`${v} → válido`, () => assert.equal(disc(v), Number(v)));
  for (const v of [101, 150, -1, 'diez']) test(`${v} → error claro`, () => assert.throws(() => disc(v), /descuento_nuevos.*entre 0 y 100/));
});

/* ------------------------------------------------------------------ 5. Longitudes */
describe('5 · longitudes máximas (respuesta invalid, sin escribir nada)', () => {
  const tryBook = (over: Record<string, unknown>) => {
    const book = fixtureBook();
    const { gs } = loadWithBook(book, { now: NOW });
    return { res: plain(gs.createBooking(req(over))), rows: book.getSheetByName('Citas')!.data.length - 1 };
  };
  const longEmail = (n: number) => 'a'.repeat(n - '@prueba.test'.length) + '@prueba.test';
  for (const [label, over, ok] of [
    ['nombre de 100', { name: 'N'.repeat(100) }, true], ['nombre de 101', { name: 'N'.repeat(101) }, false],
    ['email de 254', { email: longEmail(254) }, true], ['email de 255', { email: longEmail(255) }, false],
    ['teléfono de 30 caracteres', { phone: '+34 600 111 222 (casa)    ext.' }, true], ['teléfono de 31 caracteres', { phone: '+34 600 111 222 (casa)    ext.1' }, false],
    ['teléfono con 15 cifras', { phone: '123456789012345' }, true], ['teléfono con 16 cifras', { phone: '1234567890123456' }, false],
    ['teléfono con 8 cifras', { phone: '60011122' }, false],
    ['notas de 500', { notes: 'x'.repeat(500) }, true], ['notas de 501', { notes: 'x'.repeat(501) }, false],
  ] as [string, Record<string, unknown>, boolean][]) {
    test(`${label} → ${ok ? 'se acepta' : 'invalid'}`, () => {
      const { res, rows } = tryBook(over);
      if (ok) { assert.equal(res.ok, true, JSON.stringify(res)); assert.equal(rows, 1); }
      else { assert.deepEqual(res, { ok: false, error: 'invalid' }); assert.equal(rows, 0); }
    });
  }
  test('las notas ya no se recortan en silencio: se guardan completas', () => {
    const book = fixtureBook();
    loadWithBook(book, { now: NOW }).gs.createBooking(req({ notes: 'y'.repeat(500) }));
    assert.equal(String(book.getSheetByName('Citas')!.data[1][11]).length, 500);
  });
});

/* ------------------------------------------------------------------ 6. Avalanchas */
describe('6 · freno ante avalanchas (máx. 20 reservas web en 10 min)', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = (minutesAgo: number) => { const d = new Date(Date.now() - minutesAgo * 60000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // Citas de otros días (no ocupan el hueco pedido), creadas hace `ago` minutos
  const recent = (count: number, ago: number, withToken = true, status = 'Confirmada') => Array.from({ length: count }, (_, i) =>
    [`AUR-F${i}`, '2026-11-20', `${pad(9 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`, '', 'corte45', '', 'bea', '', 'C', `c${i}@prueba.test`, '600000000', '', 'es', status, '', 'Web', stamp(ago), withToken ? 'tok' + i : '']);
  const run = (rows: unknown[][]) => {
    const book = fixtureBook({}, rows);
    const { gs, warns } = loadWithBook(book, { now: NOW });
    return { res: plain(gs.createBooking(req())), written: book.getSheetByName('Citas')!.data.length - 1 - rows.length, warns };
  };
  test('19 reservas web recientes → la siguiente se acepta', () => assert.equal(run(recent(19, 1)).res.ok, true));
  test('20 reservas web en los últimos 10 min → busy, no se escribe nada y queda aviso', () => {
    const { res, written, warns } = run(recent(20, 2));
    assert.deepEqual(res, { ok: false, error: 'busy' });
    assert.equal(written, 0);
    assert.ok(warns.some((w) => /Freno de avalanchas/.test(w)));
  });
  test('las canceladas recientes también cuentan (reservar y cancelar en bucle no lo evita)', () => assert.equal(run(recent(20, 2, true, 'Cancelada')).res.error, 'busy'));
  test('reservas web de hace más de 10 min no cuentan', () => assert.equal(run(recent(30, 15)).res.ok, true));
  test('citas añadidas a mano (sin token) no cuentan', () => assert.equal(run(recent(30, 1, false)).res.ok, true));
});

/* ------------------------------------------------------------------ 7. Nombre del salón en los emails */
describe('7 · cabecera de los emails con nombre_salon', () => {
  test('aparece el nombre de Ajustes y no el texto fijo AURORA / Beauty Salon', () => {
    const { gs, mails } = loadWithBook(fixtureBook({ nombre_salon: 'Salón Brisa' }), { now: NOW });
    gs.createBooking(req());
    for (const m of mails) {
      assert.ok(m.htmlBody.includes('>Salón Brisa</div>'), 'nombre en la cabecera');
      assert.ok(!m.htmlBody.includes('AURORA') && !m.htmlBody.includes('Beauty Salon'));
    }
  });
  test('un nombre con HTML se escapa', () => {
    const { gs, mails } = loadWithBook(fixtureBook({ nombre_salon: '<script>x</script> & Co' }), { now: NOW });
    gs.createBooking(req());
    assert.ok(!mails[0].htmlBody.includes('<script>'));
    assert.ok(mails[0].htmlBody.includes('&lt;script&gt;x&lt;/script&gt; &amp; Co'));
  });
});
