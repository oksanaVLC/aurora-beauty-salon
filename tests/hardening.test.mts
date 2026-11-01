/**
 * Correcciones de la auditoría de apps-script/Code.gs: fórmulas, fechas y horas estrictas, Horarios, Cierres,
 * Citas ilegibles, emails, url_web, cancelaciones, recordatorios y preparación de hojas.
 * Todo con una hoja FALSA en memoria (tests/fake-spreadsheet.mts): no se accede a Google.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCodeGs, fixtureSheet, plain } from './helpers.mts';
import { FakeBook, FakeSheet, fixtureBook, loadWithBook, sandboxDate, CITAS_HEADER } from './fake-spreadsheet.mts';

const NOW = { date: '2026-11-02', minutes: 600 };
const WED = '2026-11-11';
const req = (over: Record<string, unknown> = {}) => ({
  action: 'book', serviceId: 'corte45', staffId: 'ana', date: WED, time: '10:00',
  name: 'Clienta Prueba', email: 'clienta@prueba.test', phone: '+34 600 111 222', notes: '', lang: 'es', ...over
});
const citaRow = (code: string, token: string, over: Partial<Record<number, unknown>> = {}) => {
  const r: unknown[] = [code, WED, '10:00', '10:45', 'corte45', 'Corte corto', 'ana', 'Ana Prueba', 'Cli', 'cli@prueba.test', '600000000', '', 'es', 'Confirmada', '', 'Web', '2026-11-01 10:00', token];
  for (const [k, v] of Object.entries(over)) r[Number(k)] = v;
  return r;
};

/* ------------------------------------------------------------------ 1. Fórmulas */
describe('1 · inyección de fórmulas', () => {
  test('control: la hoja falsa convierte en fórmula un texto que empieza por «=» (sin protección)', () => {
    const s = new FakeSheet('X'); s.appendRow(['=1+1']);
    assert.equal(s.formulas.length, 1);
  });

  test('safeText antepone «\'» a los textos que empiezan por = + - @ y deja el resto igual', () => {
    const { gs } = loadWithBook(fixtureBook());
    for (const v of ['=IMPORTXML("https://x.test")', '+34 600', '-mucho pelo', '@aurora']) assert.equal(gs.safeText(v), "'" + v);
    for (const v of ['Ana', '600 111 222', 'a@b.es', '', ' =con espacio delante']) assert.equal(gs.safeText(v), v);
  });

  test('reserva con =, +, - y @ en nombre, email, teléfono y notas: ninguna fórmula y se leen sin apóstrofo', () => {
    const book = fixtureBook();
    const { gs } = loadWithBook(book, { now: NOW });
    const data = { name: '=HYPERLINK("https://x.test","pulsa")', email: '+clienta@prueba.test', phone: '+34 600 111 222', notes: '-mucho pelo @aurora' };
    const res = plain(gs.createBooking(req(data)));
    assert.equal(res.ok, true);
    const citas = book.getSheetByName('Citas')!;
    assert.deepEqual(citas.formulas, [], 'ninguna celda convertida en fórmula');
    const row = citas.data[citas.data.length - 1];
    assert.deepEqual([row[8], row[9], row[10], row[11]], [data.name, data.email, data.phone, data.notes], 'se guarda el texto exacto, sin apóstrofo visible');
    const b = plain(gs.readBookings()).find((x: any) => x.code === res.booking.code);
    assert.deepEqual([b.name, b.email, b.phone, b.notes], [data.name, data.email, data.phone, data.notes]);
  });

  test('si una celda llegara con el apóstrofo literal, readBookings lo quita (solo delante de = + - @)', () => {
    const { gs } = loadWithBook(fixtureBook({}, [citaRow('AUR-A', 'T1', { 8: "'=x", 11: "'Hola" })]), { now: NOW });
    const b = plain(gs.readBookings())[0];
    assert.equal(b.name, '=x');
    assert.equal(b.notes, "'Hola", 'un apóstrofo legítimo delante de otra cosa se conserva');
  });
});

/* ------------------------------------------------------------------ 2. Fechas y horas */
describe('2 · fechas y horas estrictas', () => {
  const { gs } = loadWithBook(fixtureBook());
  test('fechas admitidas', () => {
    const ok: [unknown, string][] = [
      ['2026-11-13', '2026-11-13'], ['2026/11/13', '2026-11-13'], ['13/11/2026', '2026-11-13'], ['13-11-2026', '2026-11-13'],
      ['13.11.2026', '2026-11-13'], ['3/1/2027', '2027-01-03'], ['2028-02-29', '2028-02-29'], [' 13/11/2026 ', '2026-11-13'],
    ];
    for (const [v, want] of ok) assert.equal(gs.parseDate(v), want, String(v));
    assert.equal(gs.parseDate(sandboxDate(gs, 2026, 10, 13)), '2026-11-13', 'celda de fecha de Sheets');
  });
  test('fechas inexistentes o no válidas → vacío', () => {
    for (const v of ['2026-11-31', '31/11/2026', '29/02/2027', '2026-13-01', '00/11/2026', '13-11-26', '2026-11/13', '13/11-2026', '2026.11.13', 'mañana', '', null, 45678]) {
      assert.equal(gs.parseDate(v), '', String(v));
    }
  });
  test('horas admitidas', () => {
    const ok: [unknown, string][] = [['09:30', '09:30'], ['9:30', '09:30'], ['9.30', '09:30'], ['09:30:00', '09:30'], ['10h', '10:00'],
      ['10h30', '10:30'], ['10 h', '10:00'], ['10H30', '10:30'], ['00:00', '00:00'], ['24:00', '24:00']];
    for (const [v, want] of ok) assert.equal(gs.parseTime(v), want, String(v));
    assert.equal(gs.parseTime(sandboxDate(gs, 1899, 11, 30, 16, 45)), '16:45', 'celda de hora de Sheets');
  });
  test('horas no válidas → vacío', () => {
    for (const v of ['25:00', '10:75', '24:30', '24:01', '9:30:15', '930', '9:3', 'abc', '', null, '-1:00']) assert.equal(gs.parseTime(v), '', String(v));
  });
});

/* ------------------------------------------------------------------ 2b. Fechas inexistentes en disponibilidad y reservas */
describe('2b · no se reserva en fechas u horas inexistentes', () => {
  test('availableSlots de 2026-11-31 → sin huecos', () => {
    const { gs } = loadWithBook(fixtureBook(), { now: NOW });
    assert.deepEqual(plain(gs.availableSlots(plain(gs.readCatalog()), [], 'corte45', 'any', '2026-11-31')), []);
  });
  for (const [label, over] of [['fecha 2026-11-31', { date: '2026-11-31' }], ['fecha 11/11/2026 sin normalizar', { date: '11/11/2026' }], ['hora 25:00', { time: '25:00' }], ['hora 9:30 sin normalizar', { time: '9:30' }]] as const) {
    test(`createBooking con ${label} → invalid y no se escribe nada`, () => {
      const book = fixtureBook();
      const { gs } = loadWithBook(book, { now: NOW });
      assert.deepEqual(plain(gs.createBooking(req(over))), { ok: false, error: 'invalid' });
      assert.equal(book.getSheetByName('Citas')!.data.length, 1);
    });
  }
});

/* ------------------------------------------------------------------ 3. Horarios */
describe('3 · validación de Horarios (el error indica la fila)', () => {
  const withHours = (rows: unknown[][]) => { const b = fixtureBook(); b.sheets.set('Horarios', new FakeSheet('Horarios', [['dia'], ...rows])); return loadWithBook(b, { now: NOW }).gs; };
  const cases: [string, unknown[][], RegExp][] = [
    ['día no reconocido', [['lunes', '09:30', '20:00', '', ''], ['X', '09:30', '20:00', '', '']], /fila 3: día «X» no reconocido/],
    ['día repetido', [['martes', '09:30', '14:00', '', ''], ['Martes', '16:00', '20:00', '', '']], /fila 3: .*ya aparece en la fila 2/],
    ['apertura después del cierre', [['lunes', '20:00', '09:30', '', '']], /fila 2: la apertura \(20:00\) debe ser anterior al cierre \(09:30\)/],
    ['apertura igual al cierre', [['lunes', '10:00', '10:00', '', '']], /fila 2: la apertura/],
    ['cierre 25:00', [['lunes', '09:30', '25:00', '', '']], /fila 2: el cierre «25:00» no es una hora válida/],
    ['cierre 24:30', [['lunes', '09:30', '24:30', '', '']], /fila 2: el cierre «24:30»/],
    ['minutos 10:75', [['lunes', '10:75', '20:00', '', '']], /fila 2: la apertura «10:75» no es una hora válida/],
    ['falta el cierre', [['lunes', '09:30', '', '', '']], /fila 2: falta la hora de cierre/],
    ['descanso incompleto', [['lunes', '09:30', '20:00', '14:00', '']], /fila 2: el descanso está incompleto/],
    ['descanso invertido', [['lunes', '09:30', '20:00', '15:00', '14:00']], /fila 2: el descanso \(15:00–14:00\)/],
    ['descanso fuera del horario', [['lunes', '09:30', '20:00', '19:30', '21:00']], /fila 2: el descanso/],
    ['descanso que empieza al abrir', [['lunes', '09:30', '20:00', '09:30', '10:00']], /fila 2: el descanso/],
    ['descanso en día cerrado', [['domingo', '', '', '14:00', '15:00']], /fila 2: hay descanso pero el día no tiene apertura/],
    ['descanso no válido', [['lunes', '09:30', '20:00', '14:00', '14:75']], /fila 2: el descanso «14:00–14:75» no es una hora válida/],
  ];
  for (const [label, rows, msg] of cases) test(label, () => assert.throws(() => withHours(rows).readCatalog(), msg));

  test('horario válido: 24:00, formatos 9.30 / 10h y celdas de hora de Sheets', () => {
    const b = fixtureBook();
    const { gs } = loadWithBook(b, { now: NOW }); // las celdas Date se crean en el MISMO contexto que las lee
    b.sheets.set('Horarios', new FakeSheet('Horarios', [['dia'],
      ['lunes', '9.30', '20:00', '14h', '15h'], ['viernes', '16:00', '24:00', '', ''],
      ['sábado', sandboxDate(gs, 1899, 11, 30, 9, 30), sandboxDate(gs, 1899, 11, 30, 14, 0), '', ''], ['domingo', '', '', '', '']]));
    const hours = plain(gs.readCatalog()).hours;
    assert.deepEqual(hours, [
      { day: 1, open: '09:30', close: '20:00', breakStart: '14:00', breakEnd: '15:00' },
      { day: 5, open: '16:00', close: '24:00' },
      { day: 6, open: '09:30', close: '14:00' },
    ]);
  });

  test('doGet catalog con un horario erróneo → { ok:false, error:"server" } con la fila en el mensaje', () => {
    const gs = withHours([['lunes', '09:30', '25:00', '', '']]);
    const out = JSON.parse(gs.doGet({ parameter: { action: 'catalog' } }).text);
    assert.equal(out.error, 'server');
    assert.match(out.message, /Horarios, fila 2/);
  });
});

/* ------------------------------------------------------------------ Cierres */
describe('Cierres en los formatos admitidos', () => {
  const formats = ['2026-11-13', '2026/11/13', '13/11/2026', '13-11-2026', '13.11.2026'];
  for (const f of formats) {
    test(`festivo «${f}» cierra el viernes 13/11/2026`, () => {
      const b = fixtureBook(); b.sheets.set('Cierres', new FakeSheet('Cierres', [['fecha'], [f, 'Festivo']]));
      const { gs } = loadWithBook(b, { now: NOW });
      const cat = plain(gs.readCatalog());
      assert.deepEqual(cat.closures, ['2026-11-13']);
      assert.deepEqual(plain(gs.availableSlots(cat, [], 'corte45', 'any', '2026-11-13')), []);
    });
  }
  test('celda de fecha de Sheets', () => {
    const b = fixtureBook(); const { gs } = loadWithBook(b, { now: NOW });
    b.sheets.set('Cierres', new FakeSheet('Cierres', [['fecha'], [sandboxDate(gs, 2026, 10, 13), 'Festivo']]));
    assert.deepEqual(plain(gs.readCatalog()).closures, ['2026-11-13']);
  });
  for (const bad of ['2026-11-31', '13-11-26', 'Navidad', '2026.11.13']) {
    test(`festivo no válido «${bad}» → error con la fila`, () => {
      const b = fixtureBook(); b.sheets.set('Cierres', new FakeSheet('Cierres', [['fecha'], ['2026-12-08', 'ok'], [bad, 'Festivo']]));
      assert.throws(() => loadWithBook(b, { now: NOW }).gs.readCatalog(), new RegExp(`Cierres, fila 3: «${bad.replace(/[.]/g, '\\.')}» no es una fecha válida`));
    });
  }
});

/* ------------------------------------------------------------------ Citas manuales */
describe('Citas: formatos alternativos y filas ilegibles', () => {
  test('citas a mano en DD-MM-AAAA, DD.MM.AAAA, AAAA/MM/DD y hora 10h / 10.00 bloquean la agenda', () => {
    for (const [d, t] of [['11-11-2026', '10:00'], ['11.11.2026', '10h'], ['2026/11/11', '10.00']]) {
      const { gs } = loadWithBook(fixtureBook({}, [citaRow('M1', '', { 1: d, 2: t, 3: '10:45', 15: 'Manual' })]), { now: NOW });
      const b = plain(gs.readBookings());
      assert.deepEqual(b.map((x: any) => [x.date, x.time, x.end]), [[WED, '10:00', '10:45']], `${d} ${t}`);
      const slot = plain(gs.availableSlots(plain(gs.readCatalog()), b, 'corte45', 'ana', WED)).find((x: any) => x.time === '10:00');
      assert.equal(slot.staffId, null, `${d} ${t} debe ocupar las 10:00`);
    }
  });
  test('fila con fecha u hora ilegible → aviso en Ejecuciones con el número de fila (y no rompe nada)', () => {
    const { gs, warns } = loadWithBook(fixtureBook({}, [citaRow('OK', ''), citaRow('MAL1', '', { 1: '2026-11-31' }), citaRow('MAL2', '', { 2: 'por la tarde' })]), { now: NOW });
    const b = plain(gs.readBookings());
    assert.deepEqual(b.map((x: any) => x.code), ['OK']);
    assert.ok(warns.some((w) => /Citas, fila 3 \(MAL1\): la fecha «2026-11-31» no es válida/.test(w)), warns.join('\n'));
    assert.ok(warns.some((w) => /Citas, fila 4 \(MAL2\): la hora «por la tarde» no es válida/.test(w)));
  });
});

/* ------------------------------------------------------------------ 4. Emails */
describe('4 · emails', () => {
  const evil = '<a href="https://phishing.test">Pulsa aquí</a><img src=x onerror=alert(1)>';
  test('nombre con HTML malicioso: escapado en el email a la clienta y en el aviso al salón', () => {
    const book = fixtureBook();
    const { gs, mails } = loadWithBook(book, { now: NOW });
    assert.equal(plain(gs.createBooking(req({ name: evil, notes: '<b>nota</b>' }))).ok, true);
    assert.equal(mails.length, 2);
    for (const m of mails) {
      assert.ok(!m.htmlBody.includes('<a href="https://phishing.test">'), `${m.to}: enlace sin escapar`);
      assert.ok(!m.htmlBody.includes('<img src=x'), `${m.to}: img sin escapar`);
      assert.ok(!m.htmlBody.includes('<b>nota</b>'));
    }
    assert.ok(mails[1].htmlBody.includes('&lt;a href=&quot;https://phishing.test&quot;&gt;'), 'el aviso al salón muestra el texto escapado');
  });
  test('destinatarios: clienta (reply-to = email_salon) y salón (reply-to = clienta); ninguna dirección inventada', () => {
    const { gs, mails } = loadWithBook(fixtureBook(), { now: NOW });
    gs.createBooking(req());
    assert.deepEqual(mails.map((m) => [m.to, m.replyTo]), [['clienta@prueba.test', 'avisos@salon.test'], ['avisos@salon.test', 'clienta@prueba.test']]);
  });
  test('sin email_salon no se envía aviso al salón (no se inventa destinatario)', () => {
    const { gs, mails } = loadWithBook(fixtureBook({ email_salon: '' }), { now: NOW });
    gs.createBooking(req());
    assert.deepEqual(mails.map((m) => m.to), ['clienta@prueba.test']);
  });
  test('url_web válida → botón con https://…/cita?c=…&t=…', () => {
    const { gs, mails } = loadWithBook(fixtureBook({ url_web: 'https://aurorasalon.es/' }), { now: NOW });
    const res = plain(gs.createBooking(req({ lang: 'en' })));
    assert.ok(mails[0].htmlBody.includes(`href="https://aurorasalon.es/en/cita?c=${res.booking.code}&amp;t=${res.booking.token}"`));
  });
  for (const url of ['', 'http://aurorasalon.es', 'aurorasalon.es', 'https://', 'javascript:alert(1)', 'https://aurorasalon.es/?x=1', 'https://aurora salon.es', 'https://"onmouseover=x']) {
    test(`url_web «${url}» → email SIN botón, con aviso al cliente y en Ejecuciones; la reserva se guarda`, () => {
      const book = fixtureBook({ url_web: url });
      const { gs, mails, warns } = loadWithBook(book, { now: NOW });
      const res = plain(gs.createBooking(req()));
      assert.equal(res.ok, true);
      assert.equal(book.getSheetByName('Citas')!.data.length, 2, 'la cita está guardada');
      assert.ok(!/\/cita\?c=/.test(mails[0].htmlBody), 'sin enlace de cancelar');
      assert.ok(!/<img /.test(mails[0].htmlBody), 'sin logo');
      assert.ok(mails[0].htmlBody.includes('Si no puedes venir, avísanos respondiendo a este email o llamando al salón.'));
      assert.ok(warns.some((w) => /SIN botón de cancelar/.test(w)));
    });
  }
  test('un fallo de envío de email no convierte la reserva en error', () => {
    const book = fixtureBook();
    const { gs, errors } = loadWithBook(book, { now: NOW, mailFails: () => true });
    assert.equal(plain(gs.createBooking(req())).ok, true);
    assert.equal(book.getSheetByName('Citas')!.data.length, 2);
    assert.ok(errors.some((e) => /Email no enviado/.test(e)));
  });
});

/* ------------------------------------------------------------------ 5. Cancelaciones */
describe('5 · cancelaciones', () => {
  const two = () => fixtureBook({}, [citaRow('AUR-AAAA', 'TOKA'), citaRow('AUR-BBBB', 'TOKB', { 2: '12:00', 3: '12:45' })]);
  test('token correcto → solo esa fila pasa a «Cancelada»', () => {
    const book = two();
    const { gs } = loadWithBook(book, { now: NOW });
    assert.deepEqual(plain(gs.cancelBooking('AUR-AAAA', 'TOKA')), { ok: true });
    const d = book.getSheetByName('Citas')!.data;
    assert.deepEqual([d[1][13], d[2][13]], ['Cancelada', 'Confirmada']);
  });
  for (const [label, code, token] of [['token incorrecto', 'AUR-AAAA', 'MAL'], ['token vacío', 'AUR-AAAA', ''], ['token «undefined»', 'AUR-AAAA', 'undefined'], ['código inexistente', 'AUR-ZZZZ', 'TOKA']]) {
    test(`${label} → not_found y no se modifica nada`, () => {
      const book = two();
      const before = JSON.stringify(book.getSheetByName('Citas')!.data);
      const { gs } = loadWithBook(book, { now: NOW });
      assert.deepEqual(plain(gs.cancelBooking(code, token)), { ok: false, error: 'not_found' });
      assert.equal(JSON.stringify(book.getSheetByName('Citas')!.data), before);
    });
  }
  test('fila con hora ilegible (pero token correcto) → not_found sin excepción; doGet booking → { booking: null }', () => {
    const book = fixtureBook({}, [citaRow('AUR-ROTA', 'TOKR', { 2: '25:00' })]);
    const { gs } = loadWithBook(book, { now: NOW });
    assert.deepEqual(plain(gs.cancelBooking('AUR-ROTA', 'TOKR')), { ok: false, error: 'not_found' });
    assert.equal(gs.doGet({ parameter: { action: 'booking', code: 'AUR-ROTA', token: 'TOKR' } }).text, '{"booking":null}');
    assert.equal(book.getSheetByName('Citas')!.data[1][13], 'Confirmada');
  });
  test('la fila cambia entre la búsqueda y la escritura (p. ej. alguien ordena la hoja) → busy y NO se toca ninguna cita', () => {
    const book = two();
    const { gs, warns } = loadWithBook(book, { now: NOW });
    const original = gs.findBooking;
    gs.findBooking = (c: string, t: string) => { const r = original(c, t); const d = book.getSheetByName('Citas')!.data; [d[1], d[2]] = [d[2], d[1]]; return r; };
    const before = JSON.stringify(book.getSheetByName('Citas')!.data.map((r) => r[13]));
    assert.deepEqual(plain(gs.cancelBooking('AUR-AAAA', 'TOKA')), { ok: false, error: 'busy' });
    const d = book.getSheetByName('Citas')!.data;
    assert.equal(JSON.stringify(d.map((r) => r[13])), JSON.stringify(JSON.parse(before)), 'ningún estado cambiado');
    assert.ok(warns.some((w) => /la fila 2 ha cambiado/.test(w)));
  });
  test('cancelar dos veces → ok sin volver a escribir; el bloqueo se libera siempre', () => {
    const book = two();
    const { gs, lock } = loadWithBook(book, { now: NOW });
    gs.cancelBooking('AUR-AAAA', 'TOKA');
    assert.deepEqual(plain(gs.cancelBooking('AUR-AAAA', 'TOKA')), { ok: true });
    assert.equal(lock.held, false);
    assert.equal(lock.released, 2);
  });
});

/* ------------------------------------------------------------------ Reserva: columnas A–R, bloqueo */
describe('reservas: columnas A–R y bloqueo', () => {
  test('createBooking escribe 18 columnas en el orden de HEADERS.Citas', () => {
    const book = fixtureBook();
    const { gs } = loadWithBook(book, { now: NOW });
    const res = plain(gs.createBooking(req()));
    const row = book.getSheetByName('Citas')!.data[1];
    assert.equal(row.length, 18);
    assert.deepEqual(plain(gs.HEADERS.Citas), CITAS_HEADER);
    assert.deepEqual([row[0], row[1], row[2], row[3], row[4], row[6], row[13], row[15], row[17]],
      [res.booking.code, WED, '10:00', '10:45', 'corte45', 'ana', 'Confirmada', 'Web', res.booking.token]);
  });
  test('la misma hora con la misma profesional no se puede reservar dos veces', () => {
    const book = fixtureBook();
    const { gs } = loadWithBook(book, { now: NOW });
    assert.equal(plain(gs.createBooking(req())).ok, true);
    assert.deepEqual(plain(gs.createBooking(req({ email: 'otra@prueba.test' }))), { ok: false, error: 'slot_taken' });
    assert.equal(book.getSheetByName('Citas')!.data.length, 2);
  });
  test('hoja ocupada (lock no disponible) → busy y no se escribe nada', () => {
    const book = fixtureBook();
    const { gs } = loadWithBook(book, { now: NOW, lockFree: false });
    assert.deepEqual(plain(gs.createBooking(req())), { ok: false, error: 'busy' });
    assert.equal(book.getSheetByName('Citas')!.data.length, 1);
  });
  test('si algo falla dentro de la reserva, el bloqueo se libera', () => {
    const book = fixtureBook({ telefono: '' }); // catálogo inválido → readCatalog lanza
    const { gs, lock } = loadWithBook(book, { now: NOW });
    assert.throws(() => gs.createBooking(req()), /telefono/);
    assert.equal(lock.held, false);
    assert.equal(book.getSheetByName('Citas')!.data.length, 1);
  });
});

/* ------------------------------------------------------------------ 6. Recordatorios */
describe('6 · recordatorios', () => {
  const tomorrowRows = () => [
    citaRow('R1', 'T1', { 1: '2026-11-03', 9: 'uno@prueba.test' }), citaRow('R2', 'T2', { 1: '2026-11-03', 2: '11:00', 3: '11:45', 9: 'falla@prueba.test' }),
    citaRow('R3', 'T3', { 1: '2026-11-03', 2: '12:00', 3: '12:45', 9: 'tres@prueba.test' }), citaRow('R4', 'T4', { 1: '2026-11-03', 2: '13:00', 3: '13:45', 9: 'cancelada@prueba.test', 13: 'Cancelada' }),
  ];
  test('enviar_emails = NO → no se envía ninguno', () => {
    const { gs, mails } = loadWithBook(fixtureBook({ enviar_emails: 'NO' }, tomorrowRows()), { now: NOW });
    assert.equal(gs.enviarRecordatorios(), 0);
    assert.equal(mails.length, 0);
  });
  test('un email que falla no impide enviar los demás (y no se envía a citas canceladas)', () => {
    const { gs, mails, errors } = loadWithBook(fixtureBook({}, tomorrowRows()), { now: NOW, mailFails: (to) => to === 'falla@prueba.test' });
    assert.equal(gs.enviarRecordatorios(), 2);
    assert.deepEqual(mails.map((m) => m.to), ['uno@prueba.test', 'tres@prueba.test']);
    assert.ok(errors.some((e) => /cita R2/.test(e)));
  });
});

/* ------------------------------------------------------------------ B. Preparación de hojas */
describe('B · setup(): sin datos ficticios y sin tocar lo existente', () => {
  test('libro vacío: 6 pestañas solo con cabecera; Ajustes con las claves VACÍAS; sin nombres, direcciones ni servicios', () => {
    const book = new FakeBook();
    const { gs, alerts } = loadWithBook(book);
    gs.setup();
    assert.deepEqual([...book.sheets.keys()].sort(), ['Ajustes', 'Cierres', 'Citas', 'Equipo', 'Horarios', 'Servicios']);
    for (const name of ['Servicios', 'Equipo', 'Horarios', 'Cierres', 'Citas']) {
      assert.deepEqual(plain(book.getSheetByName(name)!.data), [plain(gs.HEADERS[name])], `${name}: solo cabecera`);
    }
    const ajustes = book.getSheetByName('Ajustes')!.data;
    assert.deepEqual(plain(ajustes[0]), plain(gs.HEADERS.Ajustes));
    assert.deepEqual(ajustes.slice(1).map((r) => r[0]), plain(gs.SETTING_KEYS).map((k: string[]) => k[0]));
    assert.ok(ajustes.slice(1).every((r) => r[1] === ''), 'todos los valores vacíos');
    const all = JSON.stringify([...book.sheets.values()].map((s) => s.data));
    for (const fake of ['Lucía', 'Marta', 'Irene', 'Aurora Beauty Salon', "Carrer", '+34', 'corte', '@']) assert.ok(!all.includes(fake), `contiene «${fake}»`);
    assert.ok(book.log.includes('zona Europe/Madrid'), 'zona horaria solo en libro nuevo');
    assert.ok(!book.log.some((l) => l.startsWith('BORRAR')));
    assert.ok(book.getSheetByName('Citas')!.log.includes('formato condicional'), 'Citas nueva: formato del estado');
    assert.equal(alerts.length, 1);
  });

  test('libro en uso: no cambia datos, formatos, validaciones ni zona horaria; solo añade al final los ajustes que faltan', () => {
    const book = fixtureBook({}, [citaRow('AUR-AAAA', 'TOKA')]);
    const ajustes = book.getSheetByName('Ajustes')!;
    ajustes.data = ajustes.data.filter((r) => r[0] !== 'instagram' && r[0] !== 'zona_horaria'); // faltan dos claves
    const before = new Map([...book.sheets].map(([k, s]) => [k, JSON.stringify(s.data)]));
    const { gs } = loadWithBook(book);
    gs.setup();
    for (const [k, s] of book.sheets) {
      if (k === 'Ajustes') continue;
      assert.equal(JSON.stringify(s.data), before.get(k), `${k}: datos intactos`);
      assert.deepEqual(s.log, [], `${k}: sin cambios de formato/validación`);
    }
    const prev = JSON.parse(before.get('Ajustes')!);
    assert.deepEqual(ajustes.data.slice(0, prev.length), prev, 'las filas existentes de Ajustes no cambian');
    assert.deepEqual(ajustes.data.slice(prev.length).map((r) => [r[0], r[1]]), [['instagram', ''], ['zona_horaria', '']]);
    assert.ok(!book.log.some((l) => l.startsWith('zona') || l.startsWith('BORRAR') || l.startsWith('crear')));
  });

  test('pestaña existente pero totalmente vacía: solo se escribe la cabecera', () => {
    const book = fixtureBook();
    book.sheets.set('Equipo', new FakeSheet('Equipo', []));
    loadWithBook(book).gs.setup();
    assert.equal(book.getSheetByName('Equipo')!.data.length, 1);
  });

  test('el código no contiene datos comerciales de ejemplo (servicios, profesionales, dirección, teléfono)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
    for (const fake of ['Lucía Ferrer', 'Marta Soler', 'Irene Navarro', "Carrer de l'Aurora", '697 211', 'peinado.jpg', 'Session.getActiveUser', 'deleteSheet']) {
      assert.ok(!src.includes(fake), `Code.gs contiene «${fake}»`);
    }
  });
});

/* ------------------------------------------------------------------ Correcciones anteriores siguen vigentes */
describe('correcciones anteriores', () => {
  test('cita sin «fin» → duración del servicio; servicio desconocido → duración máxima; nunca más allá de 24:00', () => {
    const { gs } = loadWithBook(fixtureBook({}, [
      citaRow('S1', '', { 3: '' }), citaRow('S2', '', { 2: '12:00', 3: '', 4: 'desconocido', 5: '' }), citaRow('S3', '', { 2: '23:30', 3: '', 4: 'corte' }),
    ]), { now: NOW });
    assert.deepEqual(plain(gs.readBookings()).map((b: any) => b.end), ['10:45', '13:15', '24:00']);
  });
  test('HEADERS.Servicios incluye posicion_imagen en la columna L', () => {
    const { gs } = loadWithBook(fixtureBook());
    assert.equal(gs.HEADERS.Servicios[11], 'posicion_imagen');
    assert.equal(plain(gs.readCatalog()).services[0].imagePos, '50% 30%');
  });
});
