/**
 * AURORA BEAUTY SALON — Motor de reservas sobre Google Sheets
 * -----------------------------------------------------------
 * Este script convierte una hoja de Google en la «base de datos» y el «panel»
 * del salón. La web (Astro) le pregunta los servicios y huecos libres, y él
 * apunta las citas en la pestaña «Citas».
 *
 * Instalación: ver docs/GOOGLE-SHEETS.md (10 minutos, sin programar).
 *
 * Pestañas que crea «Aurora → Preparar hoja»:
 *   Ajustes   · datos del salón y reglas (intervalo, antelación, descuento…)
 *   Servicios · el «CMS»: nombre ES/EN/RU, duración, precio, visible
 *   Equipo    · profesionales, qué servicios hacen y qué días trabajan
 *   Horarios  · apertura, cierre y descanso de cada día
 *   Cierres   · festivos y vacaciones (el salón no abre)
 *   Citas     · la agenda. Cancelar = poner «Cancelada» en la columna Estado
 */

/* =========================================================================
 * 1. Configuración de las pestañas
 * ========================================================================= */

var SHEETS = {
  settings: 'Ajustes',
  services: 'Servicios',
  staff: 'Equipo',
  hours: 'Horarios',
  closures: 'Cierres',
  bookings: 'Citas'
};

var HEADERS = {
  Ajustes: ['clave', 'valor', 'para qué sirve'],
  Servicios: ['id', 'nombre_es', 'nombre_en', 'nombre_ru', 'descripcion_es', 'descripcion_en', 'descripcion_ru', 'duracion_min', 'precio_desde', 'visible', 'imagen', 'posicion_imagen'],
  Equipo: ['id', 'nombre', 'rol_es', 'rol_en', 'rol_ru', 'servicios (ids separados por comas)', 'dias (lun,mar,mie,jue,vie,sab,dom)', 'activo'],
  Horarios: ['dia', 'abre', 'cierra', 'descanso_inicio', 'descanso_fin'],
  Cierres: ['fecha (AAAA-MM-DD)', 'motivo'],
  Citas: ['codigo', 'fecha', 'hora', 'fin', 'servicio_id', 'servicio', 'profesional_id', 'profesional', 'cliente', 'email', 'telefono', 'notas', 'idioma', 'estado', 'descuento_%', 'origen', 'creada', 'token']
};

var DAY_KEYS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

/** Límites técnicos de seguridad (no son datos comerciales). */
var LIMITS = {
  name: 100, email: 254, phone: 30, phoneDigitsMin: 9, phoneDigitsMax: 15, notes: 500,
  lockWaitMs: 10000,      // espera máxima al bloqueo: la web corta a los 20 s, así siempre recibe una respuesta clara
  floodWindowMin: 10,     // freno ante avalanchas: como mucho floodMaxBookings reservas web
  floodMaxBookings: 20    // en los últimos floodWindowMin minutos (un salón real no se acerca a esa cifra)
};
var DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/* =========================================================================
 * 2. API web (la llama la web de Astro)
 * ========================================================================= */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'catalog':
        return json(readCatalog());
      case 'slots':
        var cat = readCatalog();
        return json({ slots: availableSlots(cat, readBookings(), p.service, p.staff || 'any', p.date) });
      case 'booking':
        var b = findBooking(p.code, p.token);
        return json({ booking: b ? b.data : null });
      case 'ping':
        return json({ ok: true, salon: salonName() });
      default:
        return json({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server', message: String(err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'invalid' }); }
  try {
    if (body.action === 'book') return json(createBooking(body));
    if (body.action === 'cancel') return json(cancelBooking(body.code, body.token));
    return json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server', message: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================================
 * 3. Lectura de la hoja
 * ========================================================================= */

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tz() { return getSetting('zona_horaria', 'Europe/Madrid'); }

function rows(name) {
  var sh = ss().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
    .map(function (r, i) { r.__row = i + 2; return r; }) // número de fila en la hoja, para los mensajes
    .filter(function (r) { return r.join('').toString().trim() !== ''; });
}
/** Número de fila en la hoja de una fila devuelta por rows() (para los mensajes de error). */
function rowNumber(r, i) { return r.__row || i + 2; }
function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }

var _settings = null;
function getSetting(key, fallback) {
  if (!_settings) {
    _settings = {};
    var sh = ss().getSheetByName(SHEETS.settings);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { _settings[String(r[0]).trim()] = r[1]; });
    }
  }
  var v = _settings[key];
  return v === undefined || v === '' ? fallback : v;
}

/**
 * Ajuste obligatorio de la pestaña «Ajustes». Si falta o no es válido, lanza un error claro
 * (la web muestra «no se han podido cargar los datos»): nunca se inventa un valor de respaldo.
 */
function requireSetting(key) {
  var v = getSetting(key, '');
  if (String(v).trim() === '') throw new Error('Falta el ajuste obligatorio «' + key + '» en la pestaña Ajustes.');
  return String(v).trim();
}
function requireNumberSetting(key, min, max) {
  var v = getSetting(key, '');
  var n = Number(v);
  var range = max === undefined ? 'un número ≥ ' + min : 'un número entre ' + min + ' y ' + max;
  if (String(v).trim() === '' || isNaN(n) || n < min || (max !== undefined && n > max)) {
    throw new Error('El ajuste «' + key + '» de la pestaña Ajustes debe ser ' + range + ' (ahora: «' + v + '»).');
  }
  return n;
}/** Ajuste opcional: texto vacío si no está (la web simplemente no muestra ese dato). */
function optionalSetting(key) { return String(getSetting(key, '')).trim(); }
function salonName() { return optionalSetting('nombre_salon'); }

function yes(v) { return /^(s[ií]|si|yes|true|1|x|✓)$/i.test(String(v).trim()) || v === true; }

/** AAAA-MM-DD si la fecha existe en el calendario (p. ej. rechaza 31/11 y 29/02 de años no bisiestos); si no, ''. */
function realDate(y, m, d) {
  var Y = Number(y), M = Number(m), D = Number(d);
  if (!(Y >= 1900 && Y <= 2999 && M >= 1 && M <= 12 && D >= 1 && D <= 31)) return '';
  var iso = Y + '-' + pad(M) + '-' + pad(D);
  return addDays(iso, 0) === iso ? iso : '';
}

/**
 * Fecha estricta. Acepta: celda de fecha de Sheets, AAAA-MM-DD, AAAA/MM/DD, DD/MM/AAAA, DD-MM-AAAA y DD.MM.AAAA.
 * Devuelve AAAA-MM-DD, o '' si no se entiende o la fecha no existe.
 */
function parseDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz(), 'yyyy-MM-dd');
  var s = String(v === null || v === undefined ? '' : v).trim(), m;
  if ((m = s.match(/^(\d{4})([-\/])(\d{1,2})\2(\d{1,2})$/))) return realDate(m[1], m[3], m[4]);
  if ((m = s.match(/^(\d{1,2})([-\/.])(\d{1,2})\2(\d{4})$/))) return realDate(m[4], m[3], m[1]);
  return '';
}/**
 * Hora estricta del día. Acepta: celda de hora de Sheets, HH:MM, H:MM, HH:MM:00, H.MM, 10h y 10h30.
 * Devuelve HH:MM entre 00:00 y 24:00 (24:00 solo exacta), o '' si no es una hora válida (25:00, 10:75…).
 */
function parseTime(v) {
  var h, m, x;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    h = v.getHours(); m = v.getMinutes();
  } else {
    var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
    if ((x = s.match(/^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/))) {
      if (x[3] !== undefined && Number(x[3]) !== 0) return '';
      h = Number(x[1]); m = Number(x[2]);
    } else if ((x = s.match(/^(\d{1,2})\s*h(?:\s*(\d{2}))?$/))) {
      h = Number(x[1]); m = x[2] ? Number(x[2]) : 0;
    } else {
      return '';
    }
  }
  if (m > 59 || h > 24 || (h === 24 && m !== 0)) return '';
  return pad(h) + ':' + pad(m);
}

/**
 * Texto escrito por la clienta (nombre, email, teléfono, notas). Si empieza por = + - @, se antepone ' para
 * que Google Sheets lo guarde como texto y nunca lo ejecute como fórmula. Sheets oculta ese apóstrofo al leer.
 */
function safeText(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
/** Lectura de esos textos: si alguna vez llegara el apóstrofo de protección, se quita (solo delante de = + - @). */
function readText(v) { return String(v === null || v === undefined ? '' : v).replace(/^'(?=[=+\-@])/, ''); }function pad(n) { return ('0' + n).slice(-2); }
function toMin(t) { var p = t.split(':'); return Number(p[0]) * 60 + Number(p[1]); }
function toHHMM(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
function weekday(date) { var p = date.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
function addDays(date, n) { var p = date.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }

function dayIndex(v) {
  var s = String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3);
  var map = { dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return map.hasOwnProperty(s) ? map[s] : -1;
}

/** Todo lo que la web necesita: mismo formato que src/lib/booking-core.ts (Catalog). */
function readCatalog() {
  var services = rows(SHEETS.services).map(function (r) {
    var s = {
      id: String(r[0]).trim(),
      name: { es: String(r[1]), en: String(r[2] || r[1]), ru: String(r[3] || r[1]) },
      desc: { es: String(r[4]), en: String(r[5] || r[4]), ru: String(r[6] || r[4]) },
      duration: Number(r[7]),
      price: Number(r[8]),
      visible: yes(r[9]),
      image: String(r[10] || '').trim() || undefined,
      // Columna opcional L «posicion_imagen» (p. ej. «50% 30%»): encuadre de la foto. Vacía = centrada.
      imagePos: String(r[11] || '').trim() || undefined
    };
    // Un servicio visible sin duración o precio válidos no se puede mostrar ni reservar: error claro, sin inventar valores.
    if (s.id && s.visible) {
      if (String(r[7]).trim() === '' || !(s.duration > 0)) throw new Error('Servicio «' + s.id + '»: duracion_min vacía o no válida («' + r[7] + '»).');
      if (String(r[8]).trim() === '' || isNaN(s.price) || s.price < 0) throw new Error('Servicio «' + s.id + '»: precio_desde vacío o no válido («' + r[8] + '»).');
      if (!String(r[1]).trim()) throw new Error('Servicio «' + s.id + '»: falta nombre_es.');
    }
    return s;
  }).filter(function (s) { return s.id; });

  var staff = readStaff();

  var hours = readHours();
  var closures = readClosures();

  return {
    // Datos del salón que muestra la web (contacto, pie, páginas legales, calendario).
    salon: {
      name: requireSetting('nombre_salon'),
      address: requireSetting('direccion'),
      phone: requireSetting('telefono'),
      email: optionalSetting('email_contacto'),
      instagram: optionalSetting('instagram'),
      legalName: optionalSetting('razon_social'),
      cif: optionalSetting('cif'),
      registry: optionalSetting('registro_mercantil')
    },
    settings: {
      slotMinutes: requireNumberSetting('intervalo_minutos', 5),
      bookingDays: requireNumberSetting('dias_reserva', 1),
      leadHours: requireNumberSetting('antelacion_horas', 0),
      newClientDiscount: requireNumberSetting('descuento_nuevos', 0, 100)
    },
    services: services, staff: staff, hours: hours, closures: closures
  };
}

/**
 * Pestaña «Horarios», validada. Cada fila: día reconocido y sin repetir; apertura y cierre vacíos (= cerrado)
 * o horas válidas con apertura < cierre ≤ 24:00; descanso vacío o completo, ordenado y dentro del horario.
 * Cualquier error indica la fila: la web muestra «no se han podido cargar los datos» hasta corregirlo.
 */
function readHours() {
  var seen = {};
  var out = [];
  rows(SHEETS.hours).forEach(function (r, i) {
    var n = rowNumber(r, i), where = 'Horarios, fila ' + n + ': ';
    var label = String(cell(r, 0)).trim();
    var day = dayIndex(label);
    if (day < 0) throw new Error(where + 'día «' + label + '» no reconocido (usa lunes, martes… o lun, mar…).');
    if (seen[day]) throw new Error(where + 'el día «' + label + '» ya aparece en la fila ' + seen[day] + '.');
    seen[day] = n;
    var o = cell(r, 1), c = cell(r, 2), bs = cell(r, 3), be = cell(r, 4);
    if (isBlank(o) && isBlank(c)) {
      if (!isBlank(bs) || !isBlank(be)) throw new Error(where + 'hay descanso pero el día no tiene apertura ni cierre.');
      return; // día cerrado
    }
    if (isBlank(o) || isBlank(c)) throw new Error(where + 'falta la hora de ' + (isBlank(o) ? 'apertura' : 'cierre') + ' (deja las dos vacías si ese día está cerrado).');
    var open = parseTime(o), close = parseTime(c);
    if (!open) throw new Error(where + 'la apertura «' + o + '» no es una hora válida (HH:MM entre 00:00 y 24:00).');
    if (!close) throw new Error(where + 'el cierre «' + c + '» no es una hora válida (HH:MM entre 00:00 y 24:00).');
    if (toMin(open) >= toMin(close)) throw new Error(where + 'la apertura (' + open + ') debe ser anterior al cierre (' + close + ').');
    var h = { day: day, open: open, close: close };
    if (!isBlank(bs) || !isBlank(be)) {
      if (isBlank(bs) || isBlank(be)) throw new Error(where + 'el descanso está incompleto: indica inicio y fin, o deja los dos vacíos.');
      var b1 = parseTime(bs), b2 = parseTime(be);
      if (!b1 || !b2) throw new Error(where + 'el descanso «' + bs + '–' + be + '» no es una hora válida (HH:MM).');
      if (!(toMin(open) < toMin(b1) && toMin(b1) < toMin(b2) && toMin(b2) < toMin(close))) {
        throw new Error(where + 'el descanso (' + b1 + '–' + b2 + ') debe empezar después de abrir (' + open + '), acabar antes de cerrar (' + close + ') y su inicio ser anterior a su fin.');
      }
      h.breakStart = b1; h.breakEnd = b2;
    }
    out.push(h);
  });
  return out;
}

/** Días de la semana admitidos en «Equipo» (español e inglés, completos o abreviados), sin tildes. */
var DAY_WORDS = {
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0,
  lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0,
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0
};
/** Orden de la semana para los rangos: lunes → domingo. */
var WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Día exacto (sin aceptar palabras que solo empiecen igual, como «lunático»). -1 si no se reconoce. */
function strictDay(v) {
  var k = String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.$/, '');
  return DAY_WORDS.hasOwnProperty(k) ? DAY_WORDS[k] : -1;
}

/**
 * Días de trabajo de «Equipo»: lista separada por comas, con rangos opcionales en orden lunes → domingo:
 * «mar, mie, jue», «lunes-viernes», «lun a vie», «Monday to Friday», «lun-mie, sab». Error claro si algo no se entiende.
 */
function parseWorkDays(text, where) {
  var out = [];
  String(text === null || text === undefined ? '' : text).split(/[,;]/).forEach(function (part) {
    var p = part.trim();
    if (!p) return;
    var m = p.match(/^(\S+)\s*[-–—]\s*(\S+)$/) || p.match(/^(\S+)\s+(?:a|al|to)\s+(\S+)$/i);
    if (m) {
      var a = strictDay(m[1]), b = strictDay(m[2]);
      if (a < 0 || b < 0) throw new Error(where + 'el rango de días «' + p + '» tiene un día no reconocido.');
      var ia = WEEK_ORDER.indexOf(a), ib = WEEK_ORDER.indexOf(b);
      if (ia > ib) throw new Error(where + 'el rango de días «' + p + '» está al revés: usa el orden lunes → domingo (p. ej. «lun-vie»).');
      for (var i = ia; i <= ib; i++) if (out.indexOf(WEEK_ORDER[i]) < 0) out.push(WEEK_ORDER[i]);
      return;
    }
    var d = strictDay(p);
    if (d < 0) throw new Error(where + 'el día «' + p + '» no se reconoce (usa lunes, martes… o lun, mar…, separados por comas, o un rango como «lun-vie»).');
    if (out.indexOf(d) < 0) out.push(d);
  });
  return out;
}

/**
 * Pestaña «Equipo», validada. Solo cuenta a las profesionales con activo = SI; cada una necesita id único,
 * nombre y al menos un día de trabajo reconocido. Los errores indican la fila. Las inactivas no se validan.
 */
function readStaff() {
  var seen = {};
  var out = [];
  rows(SHEETS.staff).forEach(function (r, i) {
    if (!yes(cell(r, 7))) return;
    var n = rowNumber(r, i), where = 'Equipo, fila ' + n + ': ';
    var id = String(cell(r, 0)).trim(), name = String(cell(r, 1)).trim();
    if (!id) throw new Error(where + 'falta el id de la profesional activa' + (name ? ' «' + name + '»' : '') + '.');
    if (!name) throw new Error(where + 'falta el nombre de la profesional «' + id + '».');
    if (seen[id]) throw new Error(where + 'el id «' + id + '» ya se usa en la fila ' + seen[id] + '.');
    seen[id] = n;
    var days = parseWorkDays(cell(r, 6), where);
    if (!days.length) throw new Error(where + '«' + name + '» no tiene días de trabajo (o marca activo = NO).');
    out.push({
      id: id,
      name: name,
      role: { es: String(cell(r, 2)), en: String(cell(r, 3) || cell(r, 2)), ru: String(cell(r, 4) || cell(r, 2)) },
      services: String(cell(r, 5)).split(',').map(function (x) { return x.trim(); }).filter(String),
      days: days
    });
  });
  return out;
}

/** Pestaña «Cierres», validada: cada fila necesita una fecha que exista (AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA, DD.MM.AAAA…). */
function readClosures() {
  return rows(SHEETS.closures).map(function (r, i) {
    var raw = cell(r, 0), d = parseDate(raw);
    if (!d) throw new Error('Cierres, fila ' + rowNumber(r, i) + ': «' + raw + '» no es una fecha válida (usa AAAA-MM-DD, DD/MM/AAAA, DD-MM-AAAA o DD.MM.AAAA).');
    return d;
  });
}

/** Celda de una fila; '' si la columna no existe o está vacía (nunca «undefined»). */
function cell(r, i) { var v = r[i]; return v === undefined || v === null ? '' : v; }

/**
 * Duraciones válidas (> 0 min) de la pestaña Servicios, por id y por nombre en español,
 * y la más larga del catálogo. Solo se usan para citas sin hora de fin válida.
 */
function serviceDurations() {
  var byId = {}, byName = {}, idByName = {}, max = 0;
  rows(SHEETS.services).forEach(function (r) {
    var id = String(cell(r, 0)).trim(), name = String(cell(r, 1)).trim().toLowerCase(), d = Number(cell(r, 7));
    if (id && name) idByName[name] = id;
    if (!(d > 0)) return;
    if (id) byId[id] = d;
    if (name) byName[name] = d;
    if (d > max) max = d;
  });
  return { byId: byId, byName: byName, idByName: idByName, max: max };
}

/** Fin del día en minutos. La disponibilidad se calcula por fecha y los horarios abren y cierran el mismo día. */
var DAY_END_MIN = 24 * 60;

/**
 * Hora de fin con la que una cita bloquea la agenda. NO modifica la hoja.
 * Siempre devuelve una hora POSTERIOR a «hora» y como máximo «24:00» (las citas solo cuentan en su fecha),
 * o '' si «hora» no es una hora del día (≥ 24:00): esa fila no puede coincidir con ningún hueco y se ignora.
 *  1. «fin» de la hoja, si es una hora válida posterior a «hora».
 *  2. Si falta o no es válido: hora + duración ACTUAL del servicio (por servicio_id o por el nombre de la columna «servicio»).
 *  3. Si el servicio no se reconoce: hora + el servicio más largo del catálogo (no se ofrece ningún hueco que pudiera solaparse).
 *  4. Si además no hay ninguna duración válida en Servicios: bloquea el resto del día (hasta 24:00), sin inventar una duración.
 * En los casos 3 y 4 se avisa en Apps Script → Ejecuciones para que el salón complete «fin» o «servicio_id».
 */
function bookingEnd(code, time, finRaw, serviceId, serviceName, dur) {
  if (!time) return '';
  var start = toMin(time);
  if (!(start >= 0 && start < DAY_END_MIN)) {
    console.warn('Cita ' + code + ': «' + time + '» no es una hora del día; se ignora porque no puede coincidir con ningún hueco. Corrige «hora» en la hoja.');
    return '';
  }
  var end;
  var fin = parseTime(finRaw);
  if (fin && toMin(fin) > start) {
    end = toMin(fin);
  } else {
    var d = dur.byId[serviceId] || dur.byName[String(serviceName).trim().toLowerCase()];
    if (!d && dur.max > 0) {
      d = dur.max;
      console.warn('Cita ' + code + ' sin «fin» válido y con servicio desconocido («' + serviceId + '» / «' + serviceName + '»): se bloquean ' + d + ' min por seguridad. Completa «fin» o «servicio_id» en la hoja.');
    }
    if (d > 0) {
      end = start + d;
    } else {
      end = DAY_END_MIN;
      console.warn('Cita ' + code + ' sin «fin» válido y sin ninguna duración válida en Servicios: se bloquea el resto del día por seguridad. Completa «fin» en la hoja.');
    }
  }
  return toHHMM(Math.min(end, DAY_END_MIN)); // > start, porque start < 24:00 y end > start
}

/**
 * Citas de la hoja, en el formato Booking de la web. Incluye las añadidas a mano. Columnas A–R (18), en el orden de HEADERS.Citas.
 * Una fila cuya fecha u hora no se pueda interpretar NO bloquea la agenda: se avisa en Apps Script → Ejecuciones con su número de fila.
 */
function readBookings() {
  var staffByName = {};
  rows(SHEETS.staff).forEach(function (r) { staffByName[String(cell(r, 1)).trim().toLowerCase()] = String(cell(r, 0)).trim(); });
  var dur = serviceDurations();

  return rows(SHEETS.bookings).map(function (r, i) {
    var code = String(cell(r, 0));
    var date = parseDate(cell(r, 1));
    var time = parseTime(cell(r, 2));
    if (!date || !time) {
      console.warn('Citas, fila ' + rowNumber(r, i) + ' (' + code + '): ' +
        (!date ? 'la fecha «' + cell(r, 1) + '» no es válida' : 'la hora «' + cell(r, 2) + '» no es válida') +
        '. Esta cita NO bloquea la agenda hasta que se corrija (fecha AAAA-MM-DD o DD/MM/AAAA, hora HH:MM).');
    }
    var serviceName = String(cell(r, 5));
    var serviceId = String(cell(r, 4)).trim() || dur.idByName[serviceName.trim().toLowerCase()] || '';
    return {
      code: code, date: date, time: time,
      end: bookingEnd(code, time, cell(r, 3), serviceId, serviceName, dur),
      serviceId: serviceId,
      staffId: String(cell(r, 6)).trim() || staffByName[String(cell(r, 7)).trim().toLowerCase()] || '',
      name: readText(cell(r, 8)), email: readText(cell(r, 9)), phone: readText(cell(r, 10)), notes: readText(cell(r, 11)),
      lang: String(cell(r, 12) || 'es'), status: /cancel/i.test(String(cell(r, 13))) ? 'Cancelada' : 'Confirmada',
      discount: Number(cell(r, 14)) || 0, createdAt: String(cell(r, 16)), token: String(cell(r, 17))
    };
  }).filter(function (b) { return b.date && b.time && b.end; });
}

/* =========================================================================
 * 4. Huecos libres (misma lógica que src/lib/booking-core.ts)
 * ========================================================================= */

function nowInSalon() {
  var d = new Date();
  return { date: Utilities.formatDate(d, tz(), 'yyyy-MM-dd'), minutes: Number(Utilities.formatDate(d, tz(), 'H')) * 60 + Number(Utilities.formatDate(d, tz(), 'm')) };
}

function availableSlots(cat, bookings, serviceId, staffId, date) {
  var service = cat.services.filter(function (s) { return s.id === serviceId; })[0];
  if (!service || parseDate(date) !== date) return []; // AAAA-MM-DD de una fecha que existe
  if (cat.closures.indexOf(date) >= 0) return [];
  var wd = weekday(date);
  var hours = cat.hours.filter(function (h) { return h.day === wd; })[0];
  if (!hours) return [];
  var now = nowInSalon();
  if (date < now.date || date > addDays(now.date, cat.settings.bookingDays)) return [];

  var candidates = cat.staff.filter(function (s) {
    return s.services.indexOf(serviceId) >= 0 && s.days.indexOf(wd) >= 0 && (staffId === 'any' || s.id === staffId);
  });
  if (!candidates.length) return [];

  var open = toMin(hours.open), close = toMin(hours.close);
  var bS = hours.breakStart ? toMin(hours.breakStart) : -1, bE = hours.breakEnd ? toMin(hours.breakEnd) : -1;
  var earliest = date === now.date ? now.minutes + cat.settings.leadHours * 60 : -1;
  var day = bookings.filter(function (b) { return b.date === date && b.status !== 'Cancelada'; });
  function overlaps(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }

  function freeAt(start) {
    var end = start + service.duration;
    for (var i = 0; i < candidates.length; i++) {
      var s = candidates[i];
      var busy = day.some(function (b) {
        // Una cita sin profesional asignada (añadida a mano) bloquea a todas.
        return (b.staffId === s.id || !b.staffId) && overlaps(start, end, toMin(b.time), toMin(b.end));
      });
      if (!busy) return s;
    }
    return null;
  }
  function fits(start) {
    return start >= open && start + service.duration <= close && start >= earliest &&
      !(bS >= 0 && overlaps(start, start + service.duration, bS, bE));
  }

  // 1) Huecos de la rejilla normal (cada intervalo_minutos). Los ocupados se muestran tachados.
  var byStart = {};
  for (var start = open; start + service.duration <= close; start += cat.settings.slotMinutes) {
    if (!fits(start)) continue;
    var free = freeAt(start);
    byStart[start] = { time: toHHMM(start), staffId: free ? free.id : null };
  }

  // 2) Hora exacta en la que termina cada cita de estas profesionales (p. ej. 11:15).
  //    La duración del servicio ya incluye limpieza y preparación, así que la siguiente
  //    clienta puede empezar justo ahí. Solo se añade si está libre (no se muestra tachada).
  var ids = candidates.map(function (s) { return s.id; });
  day.forEach(function (b) {
    if (b.staffId && ids.indexOf(b.staffId) < 0) return;
    var st = toMin(b.end);
    if (byStart[st] || !fits(st)) return;
    var f = freeAt(st);
    if (f) byStart[st] = { time: toHHMM(st), staffId: f.id };
  });

  return Object.keys(byStart).map(Number).sort(function (a, b) { return a - b; })
    .map(function (k) { return byStart[k]; });
}

/* =========================================================================
 * 5. Reservar y cancelar
 * ========================================================================= */

/** Token secreto del enlace «Ver o cancelar»: 32 caracteres hexadecimales de un UUID aleatorio (122 bits). */
function newToken() { return Utilities.getUuid().replace(/-/g, '').toLowerCase(); }

/** Código visible de la cita (AUR-XXXX), distinto de los que ya existen en la hoja. No es secreto: la seguridad está en el token. */
function uniqueCode(bookings) {
  var used = {};
  bookings.forEach(function (b) { used[b.code] = true; });
  for (var i = 0; i < 50; i++) {
    var c = 'AUR-' + randomCode(4);
    if (!used[c]) return c;
  }
  return 'AUR-' + randomCode(8); // prácticamente imposible llegar aquí
}

/**
 * Freno ante avalanchas: cuántas reservas web (con token) se han creado en los últimos minutos.
 * Cuenta también las canceladas, para que reservar y cancelar en bucle no sirva para saltárselo.
 */
function recentWebBookings(bookings, minutes) {
  var since = Utilities.formatDate(new Date(Date.now() - minutes * 60000), tz(), 'yyyy-MM-dd HH:mm');
  return bookings.filter(function (b) { return b.token && b.createdAt && b.createdAt >= since; }).length;
}

function createBooking(req) {
  var name = String(req.name || '').trim(), email = String(req.email || '').trim(), phone = String(req.phone || '').trim();
  var notes = String(req.notes || '').trim();
  var digits = phone.replace(/\D/g, '').length;
  if (!name || name.length > LIMITS.name ||
      email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
      phone.length > LIMITS.phone || digits < LIMITS.phoneDigitsMin || digits > LIMITS.phoneDigitsMax ||
      notes.length > LIMITS.notes) return { ok: false, error: 'invalid' };
  var lang = ['es', 'en', 'ru'].indexOf(req.lang) >= 0 ? req.lang : 'es';
  // Fecha y hora deben venir ya normalizadas (AAAA-MM-DD / HH:MM) y existir: nada de 2026-11-31 ni 25:00.
  if (parseDate(req.date) !== req.date || parseTime(req.time) !== req.time) return { ok: false, error: 'invalid' };

  // --- Dentro del bloqueo: comprobar el hueco y escribir la cita. Dos clientas a la vez → la segunda espera y vuelve a comprobar.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LIMITS.lockWaitMs)) return { ok: false, error: 'busy' };
  var booking, service, staff;
  try {
    var cat = readCatalog();
    var bookings = readBookings();
    if (recentWebBookings(bookings, LIMITS.floodWindowMin) >= LIMITS.floodMaxBookings) {
      console.warn('Freno de avalanchas: ya hay ' + LIMITS.floodMaxBookings + ' o más reservas web en los últimos ' + LIMITS.floodWindowMin + ' min. Reserva rechazada (busy).');
      return { ok: false, error: 'busy' };
    }
    service = cat.services.filter(function (s) { return s.id === req.serviceId && s.visible; })[0];
    if (!service) return { ok: false, error: 'invalid' };
    var slot = availableSlots(cat, bookings, req.serviceId, req.staffId || 'any', req.date)
      .filter(function (s) { return s.time === req.time && s.staffId; })[0];
    if (!slot) return { ok: false, error: 'slot_taken' };

    staff = cat.staff.filter(function (s) { return s.id === slot.staffId; })[0];
    var discount = isNewClient(bookings, email, phone) ? cat.settings.newClientDiscount : 0;
    booking = {
      code: uniqueCode(bookings), token: newToken(), date: req.date, time: req.time,
      end: toHHMM(toMin(req.time) + service.duration), serviceId: service.id, staffId: staff.id,
      name: name, email: email, phone: phone, notes: notes, lang: lang,
      status: 'Confirmada', discount: discount, createdAt: Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd HH:mm')
    };
    ss().getSheetByName(SHEETS.bookings).appendRow([
      booking.code, booking.date, booking.time, booking.end, service.id, service.name.es, staff.id, staff.name,
      // Datos escritos por la clienta → safeText: Sheets los guarda como texto, nunca como fórmula.
      safeText(name), safeText(email), safeText(phone), safeText(booking.notes), lang, 'Confirmada', discount || '', 'Web', booking.createdAt, booking.token
    ]);
    SpreadsheetApp.flush();
    // A partir de aquí la cita YA está guardada: nada de lo que sigue puede convertirla en un error.
    // Ordenar mueve filas: se hace aún con el bloqueo puesto (las cancelaciones usan el número de fila).
    try { sortBookings(); } catch (err) { console.error('No se pudo ordenar la hoja', err); }
  } finally {
    lock.releaseLock();
  }

  // --- Fuera del bloqueo: los emails no retienen a otras clientas. Un fallo aquí no anula la reserva.
  try { sendConfirmation(booking, service, staff); } catch (err) { console.error('Email no enviado', err); }
  return { ok: true, booking: booking };
}
function findBooking(code, token) {
  if (!code || !token) return null;
  var sh = ss().getSheetByName(SHEETS.bookings);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var rowToken = String(cell(data[i], 17));
    if (String(cell(data[i], 0)) === String(code) && rowToken !== '' && rowToken === String(token)) {
      var b = readBookings().filter(function (x) { return x.code === String(code) && x.token === String(token); })[0];
      if (!b) return null; // fila con fecha u hora ilegibles: no es una reserva válida
      return { row: i + 1, data: b };
    }
  }
  return null;
}

function cancelBooking(code, token) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LIMITS.lockWaitMs)) return { ok: false, error: 'busy' };
  var cancelled;
  try {
    var found = findBooking(code, token);
    if (!found) return { ok: false, error: 'not_found' };
    if (found.data.status === 'Cancelada') return { ok: true };
    var sh = ss().getSheetByName(SHEETS.bookings);
    // La fila puede haberse movido (orden manual, edición) entre la búsqueda y la escritura: se comprueba otra vez
    // que sigue siendo ESTA cita. Si no, no se toca nada y la web pide reintentar.
    var current = sh.getRange(found.row, 1, 1, HEADERS.Citas.length).getValues()[0];
    if (String(cell(current, 0)) !== String(code) || String(cell(current, 17)) !== String(token)) {
      console.warn('Cancelación de ' + code + ': la fila ' + found.row + ' ha cambiado; no se modifica nada.');
      return { ok: false, error: 'busy' };
    }
    sh.getRange(found.row, 14).setValue('Cancelada');
    SpreadsheetApp.flush();
    cancelled = found.data;
  } finally {
    lock.releaseLock();
  }
  // Fuera del bloqueo: el email no retiene a otras clientas. Un fallo aquí no deshace la cancelación.
  try { sendCancellation(cancelled); } catch (err) { console.error('Email no enviado', err); }
  return { ok: true };
}
function isNewClient(bookings, email, phone) {
  var e = email.trim().toLowerCase();
  var p = phone.replace(/[^\d+]/g, '');
  return !bookings.some(function (b) {
    return b.status !== 'Cancelada' && (String(b.email).trim().toLowerCase() === e || (p && String(b.phone).replace(/[^\d+]/g, '') === p));
  });
}

function randomCode(len) {
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', out = '';
  for (var i = 0; i < len; i++) out += a.charAt(Math.floor(Math.random() * a.length));
  return out;
}

function sortBookings() {
  var sh = ss().getSheetByName(SHEETS.bookings);
  if (sh.getLastRow() > 2) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort([{ column: 2, ascending: true }, { column: 3, ascending: true }]);
}

/* =========================================================================
 * 6. Emails (ES / EN / RU)
 * ========================================================================= */

var MAIL = {
  es: {
    subject: 'Tu cita en {salon} · {when}', cancelSubject: 'Cita cancelada · {salon}', reminderSubject: 'Mañana te esperamos · {salon}',
    hello: 'Hola, {name}:', confirmed: 'Tu cita está confirmada.', reminder: 'Te recordamos tu cita de mañana.',
    service: 'Servicio', staff: 'Profesional', when: 'Fecha y hora', code: 'Código', discount: 'Descuento de bienvenida: −{n} %',
    cancelBtn: 'Ver o cancelar mi cita', cancelHint: '¿No puedes venir? Cancela con un clic y el hueco quedará libre para otra persona.',
    cancelled: 'Tu cita del {when} ha sido cancelada. ¡Esperamos verte pronto!', bye: 'Hasta pronto,',
    noLink: 'Si no puedes venir, avísanos respondiendo a este email o llamando al salón.',
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'], fmt: '{wd}, {d} de {m}', path: ''
  },
  en: {
    subject: 'Your appointment at {salon} · {when}', cancelSubject: 'Appointment cancelled · {salon}', reminderSubject: 'See you tomorrow · {salon}',
    hello: 'Hi {name},', confirmed: 'Your appointment is confirmed.', reminder: 'Just a reminder of your appointment tomorrow.',
    service: 'Service', staff: 'Professional', when: 'Date & time', code: 'Code', discount: 'Welcome discount: −{n} %',
    cancelBtn: 'View or cancel my appointment', cancelHint: 'Can’t make it? Cancel in one click and the slot will be freed for someone else.',
    cancelled: 'Your appointment on {when} has been cancelled. We hope to see you soon!', bye: 'See you soon,',
    noLink: 'If you can’t make it, let us know by replying to this email or calling the salon.',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], fmt: '{wd} {d} {m}', path: '/en'
  },
  ru: {
    subject: 'Ваша запись в {salon} · {when}', cancelSubject: 'Запись отменена · {salon}', reminderSubject: 'Ждём вас завтра · {salon}',
    hello: 'Здравствуйте, {name}!', confirmed: 'Ваша запись подтверждена.', reminder: 'Напоминаем о вашей записи на завтра.',
    service: 'Услуга', staff: 'Мастер', when: 'Дата и время', code: 'Код', discount: 'Приветственная скидка: −{n} %',
    cancelBtn: 'Посмотреть или отменить запись', cancelHint: 'Не получается прийти? Отмените запись в один клик — окно освободится для другого клиента.',
    cancelled: 'Ваша запись на {when} отменена. Будем рады видеть вас снова!', bye: 'До встречи,',
    noLink: 'Если не сможете прийти, ответьте на это письмо или позвоните в салон.',
    months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    days: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'], fmt: '{wd}, {d} {m}', path: '/ru'
  }
};

function fill(s, vars) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : ''; }); }
function whenText(b, M) {
  var p = b.date.split('-');
  return fill(M.fmt, { wd: M.days[weekday(b.date)], d: Number(p[2]), m: M.months[Number(p[1]) - 1] }) + ' · ' + b.time;
}
/**
 * «url_web» de Ajustes si es una URL https válida (https://dominio[/ruta], sin parámetros), sin barra final.
 * Si falta o no es válida devuelve '' y los emails se envían sin botón de cancelar (con un aviso en Ejecuciones).
 */
function webBase() {
  var raw = String(getSetting('url_web', '')).trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?(\/[^\s?#"'<>]*)?$/i.test(raw) ? raw : '';
}
function manageUrl(b) {
  var base = webBase();
  if (!base) return '';
  return base + (MAIL[b.lang] || MAIL.es).path + '/cita?c=' + encodeURIComponent(b.code) + '&t=' + encodeURIComponent(b.token);
}/** URL pública del logo para los emails (vacía si no hay url_web válida → el email sale solo con el texto). */
function logoUrl() {
  var base = webBase();
  return base ? base + '/images/logo-email.png' : '';
}function htmlEscape(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/** HTML de los emails. TODOS los datos variables (incluido «intro», que puede llevar el nombre de la clienta) se escapan. */
function emailHtml(M, intro, b, serviceName, staffName, withButton) {
  var salon = salonName();
  var row = function (k, v) { return '<tr><td style="padding:10px 0;color:#5E5B64;font-size:15px">' + htmlEscape(k) + '</td><td style="padding:10px 0;font-size:17px;font-weight:600;text-align:right">' + htmlEscape(v) + '</td></tr>'; };
  var logo = logoUrl();
  var link = withButton ? manageUrl(b) : '';
  if (withButton && !link) console.warn('Email de la cita ' + b.code + ' enviado SIN botón de cancelar: «url_web» falta en Ajustes o no es una URL https válida.');
  return '<div style="background:#EFEFED;padding:32px 12px;font-family:Helvetica,Arial,sans-serif;color:#111">' +
    '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">' +
    // Cabecera con el logo. La imagen está en la web publicada (public/images/logo-email.png); los emails no admiten SVG.
    '<div style="background:#9DE8C9;background-image:linear-gradient(120deg,#B6F2C4,#8FE9C4,#8CE0E0,#BFEAFC);padding:20px 28px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' +
    (logo ? '<td style="padding:0 14px 0 0;vertical-align:middle"><img src="' + htmlEscape(logo) + '" width="52" height="52" alt="' + htmlEscape(salon) + '" style="display:block;width:52px;height:52px;border:0;border-radius:15px"></td>' : '') +
    // Nombre del salón tal como está en Ajustes → nombre_salon (nada fijo en el código).
    '<td style="vertical-align:middle;line-height:1.2"><div style="font-family:Georgia,serif;font-size:22px;letter-spacing:3px;color:#2A2830">' + htmlEscape(salon) + '</div></td>' +
    '</tr></table></div>' +
    '<div style="padding:28px">' +
    '<p style="font-size:17px;margin:0 0 6px">' + htmlEscape(fill(M.hello, { name: String(b.name).split(' ')[0] })) + '</p>' +
    '<p style="font-size:20px;font-weight:600;margin:0 0 18px">' + htmlEscape(intro) + '</p>' +
    '<table style="width:100%;border-collapse:collapse;border-top:1px solid #111">' +
    row(M.service, serviceName) + row(M.staff, staffName) + row(M.when, whenText(b, M)) + row(M.code, b.code) + '</table>' +
    (b.discount ? '<p style="margin:16px 0 0;font-size:16px;font-weight:600;color:#8A2E5E">' + htmlEscape(fill(M.discount, { n: b.discount })) + '</p>' : '') +
    (link ? '<p style="margin:26px 0 8px"><a href="' + htmlEscape(link) + '" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 24px;border-radius:2px;font-size:15px;letter-spacing:1px;text-transform:uppercase">' + htmlEscape(M.cancelBtn) + '</a></p>' +
      '<p style="font-size:14px;color:#5E5B64;margin:0">' + htmlEscape(M.cancelHint) + '</p>' : '') +
    (withButton && !link ? '<p style="font-size:15px;color:#5E5B64;margin:22px 0 0">' + htmlEscape(M.noLink) + '</p>' : '') +
    '<p style="font-size:15px;color:#5E5B64;margin:26px 0 0">' + htmlEscape(M.bye) + '<br>' + htmlEscape(salon) + ' · ' + htmlEscape(getSetting('direccion', '')) + ' · ' + htmlEscape(getSetting('telefono', '')) + '</p>' +
    '</div></div></div>';
}
function names(b) {
  var cat = readCatalog();
  var s = cat.services.filter(function (x) { return x.id === b.serviceId; })[0];
  var p = cat.staff.filter(function (x) { return x.id === b.staffId; })[0];
  return { service: s ? (s.name[b.lang] || s.name.es) : b.serviceId, staff: p ? p.name : '' };
}

function sendConfirmation(b, service, staff) {
  if (!yes(getSetting('enviar_emails', 'SI'))) return;
  var M = MAIL[b.lang] || MAIL.es;
  var salon = salonName();
  var serviceName = service.name[b.lang] || service.name.es;
  MailApp.sendEmail({
    to: b.email, name: salon, replyTo: getSetting('email_salon', ''),
    subject: fill(M.subject, { salon: salon, when: whenText(b, M) }),
    htmlBody: emailHtml(M, M.confirmed, b, serviceName, staff.name, true)
  });
  notifySalon('Nueva cita · ' + whenText(b, MAIL.es) + ' · ' + b.name, b, service.name.es, staff.name);
}

function sendCancellation(b) {
  if (!yes(getSetting('enviar_emails', 'SI'))) return;
  var M = MAIL[b.lang] || MAIL.es;
  var salon = salonName();
  var n = names(b);
  MailApp.sendEmail({
    to: b.email, name: salon, replyTo: getSetting('email_salon', ''),
    subject: fill(M.cancelSubject, { salon: salon }),
    htmlBody: emailHtml(M, fill(M.cancelled, { when: whenText(b, M) }), b, n.service, n.staff, false)
  });
  notifySalon('Cancelada · ' + whenText(b, MAIL.es) + ' · ' + b.name, b, n.service, n.staff);
}

function notifySalon(subject, b, serviceName, staffName) {
  var to = getSetting('email_salon', '');
  if (!to) return;
  MailApp.sendEmail({
    to: to, subject: subject, replyTo: b.email,
    htmlBody: emailHtml(MAIL.es, subject, b, serviceName, staffName, false) +
      '<p style="font-family:Helvetica,Arial;font-size:14px">Tel.: ' + htmlEscape(b.phone) + ' · ' + htmlEscape(b.email) + (b.notes ? '<br>Notas: ' + htmlEscape(b.notes) : '') + '</p>'
  });
}

/**
 * Recordatorio el día anterior. Se activa con «Aurora → Activar recordatorios diarios».
 * Respeta «enviar_emails». Un fallo con un email no impide enviar los demás. Devuelve cuántos se enviaron.
 */
function enviarRecordatorios() {
  if (!yes(getSetting('enviar_emails', 'SI'))) { console.log('Recordatorios no enviados: «enviar_emails» no es SI.'); return 0; }
  var tomorrow = addDays(nowInSalon().date, 1);
  var sent = 0;
  readBookings().filter(function (b) { return b.date === tomorrow && b.status !== 'Cancelada' && b.email && b.token; })
    .forEach(function (b) {
      try {
        var M = MAIL[b.lang] || MAIL.es;
        var n = names(b);
        MailApp.sendEmail({
          to: b.email, name: salonName(), replyTo: getSetting('email_salon', ''),
          subject: fill(M.reminderSubject, { salon: salonName() }),
          htmlBody: emailHtml(M, M.reminder, b, n.service, n.staff, true)
        });
        sent++;
      } catch (err) {
        console.error('Recordatorio no enviado (cita ' + b.code + ')', err);
      }
    });
  return sent;
}
function activarRecordatorios() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'enviarRecordatorios') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('enviarRecordatorios').timeBased().everyDays(1).atHour(10).inTimezone(tz()).create();
  SpreadsheetApp.getUi().alert('Listo: cada día a las 10:00 se enviará un recordatorio a las citas del día siguiente.');
}

/* =========================================================================
 * 7. Menú «Aurora» y preparación de la hoja
 * ========================================================================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Aurora')
    .addItem('1 · Preparar hoja (primera vez)', 'setup')
    .addItem('Añadir ajustes que faltan (no borra nada)', 'anadirAjustesQueFaltan')
    .addItem('Ordenar citas por fecha', 'sortBookings')
    .addSeparator()
    .addItem('Activar recordatorios diarios', 'activarRecordatorios')
    .addItem('Enviar recordatorios de mañana ahora', 'enviarRecordatorios')
    .addToUi();
}

/** Ajustes que usa el sistema. Los que falten se añaden con el valor VACÍO para que el salón los rellene. */
var SETTING_KEYS = [
  ['nombre_salon', 'Obligatorio · nombre que aparece en la web y en los emails'],
  ['direccion', 'Obligatorio · dirección (separa líneas con « · », p. ej. calle · ciudad). También se usa para el mapa'],
  ['telefono', 'Obligatorio · teléfono que aparece en la web y en los emails'],
  ['email_contacto', 'Opcional · email público que aparece en la web (vacío = no se muestra)'],
  ['instagram', 'Opcional · URL de Instagram (vacío = no se muestra)'],
  ['razon_social', 'Opcional · razón social para el aviso legal'],
  ['cif', 'Opcional · CIF/NIF para el aviso legal'],
  ['registro_mercantil', 'Opcional · datos registrales para el aviso legal'],
  ['intervalo_minutos', 'Obligatorio · cada cuántos minutos empieza un hueco (15, 30…)'],
  ['dias_reserva', 'Obligatorio · cuántos días hacia delante se puede reservar'],
  ['antelacion_horas', 'Obligatorio · antelación mínima para reservar el mismo día'],
  ['descuento_nuevos', 'Obligatorio · % de descuento para clientes nuevos (0 = sin descuento)'],
  ['url_web', 'Dirección https de la web, sin barra final (enlace «Cancelar» y logo de los emails). Vacía = emails sin botón'],
  ['email_salon', 'Email donde llegan los avisos de citas nuevas y cancelaciones (no se muestra en la web)'],
  ['enviar_emails', 'SI / NO · emails de confirmación, cancelación y recordatorio'],
  ['zona_horaria', 'Zona horaria del salón (vacía = Europe/Madrid)']
];

/** Añade al final de «Ajustes» las claves de SETTING_KEYS que no existan, con el valor vacío. No modifica ni borra filas. */
function addMissingSettings() {
  var sh = ss().getSheetByName(SHEETS.settings);
  if (!sh) return null;
  var existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  var added = [];
  SETTING_KEYS.forEach(function (k) {
    if (existing.indexOf(k[0]) < 0) { sh.appendRow([k[0], '', k[1]]); added.push(k[0]); }
  });
  return added;
}

/** Menú «Añadir ajustes que faltan». */
function anadirAjustesQueFaltan() {
  var added = addMissingSettings();
  if (added === null) { SpreadsheetApp.getUi().alert('No existe la pestaña «Ajustes». Usa primero «Preparar hoja».'); return; }
  SpreadsheetApp.getUi().alert(added.length ? 'Añadidas (rellénalas): ' + added.join(', ') : 'No falta ningún ajuste.');
}
/**
 * Menú «Preparar hoja». Crea las pestañas que FALTEN, solo con su cabecera (sin datos de ejemplo), y añade a
 * «Ajustes» las claves que falten, VACÍAS. En las pestañas que ya existen no escribe datos, no cambia formatos
 * ni validaciones y no borra nada.
 */
function setup() {
  var book = ss();
  // Zona horaria solo en una hoja completamente nueva (sin Ajustes ni Citas): nunca se cambia la de una hoja en uso.
  if (!book.getSheetByName(SHEETS.settings) && !book.getSheetByName(SHEETS.bookings)) book.setSpreadsheetTimeZone('Europe/Madrid');

  ensureSheet(SHEETS.settings, []);
  ensureSheet(SHEETS.services, []);
  ensureSheet(SHEETS.staff, []);
  ensureSheet(SHEETS.hours, [2, 3, 4, 5]);
  ensureSheet(SHEETS.closures, [1]);
  var citasNew = !book.getSheetByName(SHEETS.bookings);
  var citas = ensureSheet(SHEETS.bookings, [1, 2, 3, 4, 11]);
  if (citasNew) {
    // Estado con desplegable y colores, y token oculto: solo en una pestaña «Citas» recién creada.
    var estado = citas.getRange('N2:N');
    estado.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Confirmada', 'Cancelada'], true).setAllowInvalid(false).build());
    citas.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Confirmada').setBackground('#DDF3E6').setFontColor('#0F5A2E').setRanges([estado]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Cancelada').setBackground('#FBE3EE').setFontColor('#8A0A47').setRanges([estado]).build()
    ]);
    citas.hideColumns(18); // token secreto del enlace de cancelar
    citas.setColumnWidths(1, 17, 120);
    citas.setColumnWidth(6, 190); citas.setColumnWidth(9, 160); citas.setColumnWidth(10, 220);
  }
  var added = addMissingSettings() || [];
  SpreadsheetApp.getUi().alert('Hoja preparada ✓' +
    (added.length ? '\n\nRellena en «Ajustes»: ' + added.join(', ') + '.' : '') +
    '\n\nDespués añade tus servicios, equipo, horarios y cierres, y publica: Implementar → Nueva implementación → Aplicación web (ver docs/GOOGLE-SHEETS.md).');
}
/**
 * Crea la pestaña si no existe, con su cabecera, formato de texto en textCols (fechas/horas) y la fila 1 fija.
 * Si ya existe NO toca nada, salvo escribir la cabecera cuando la pestaña está totalmente vacía.
 */
function ensureSheet(name, textCols) {
  var book = ss();
  var headers = HEADERS[name];
  var sh = book.getSheetByName(name);
  if (sh) {
    if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    return sh;
  }
  sh = book.insertSheet(name);
  (textCols || []).forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#F6F5F3');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, headers.length);
  return sh;
}