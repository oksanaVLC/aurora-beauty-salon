/**
 * Hoja de cálculo falsa, en memoria, para probar Code.gs sin acceder a Google.
 * Imita el comportamiento documentado de Google Sheets que importa aquí:
 *  - Un texto que empieza por «=» escrito con appendRow/setValues se guarda como FÓRMULA.
 *  - Un texto que empieza por «'» se guarda como texto literal y el apóstrofo NO forma parte del valor.
 * Es una simulación: no sustituye a una prueba real en Google Sheets.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, fixtureSheet } from './helpers.mts';

type Cell = unknown;

export class FakeSheet {
  data: Cell[][] = [];
  formulas: string[] = []; // celdas que Sheets habría convertido en fórmula
  log: string[] = [];      // operaciones de formato/validación (para comprobar que setup no toca pestañas existentes)
  name: string;
  constructor(name: string, rows: Cell[][] = []) { this.name = name; this.data = rows.map((r) => [...r]); }

  private store(v: Cell, r: number, c: number) {
    if (typeof v === 'string' && v.startsWith('=')) { this.formulas.push(`${this.name}!R${r + 1}C${c + 1}: ${v}`); return '#FORMULA'; }
    if (typeof v === 'string' && v.startsWith("'")) return v.slice(1); // prefijo de texto: Sheets lo oculta
    return v;
  }
  private put(r: number, c: number, v: Cell) {
    while (this.data.length <= r) this.data.push([]);
    const row = this.data[r];
    while (row.length < c) row.push('');
    row[c] = this.store(v, r, c);
  }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(0, ...this.data.map((r) => r.length)); }
  getMaxRows() { return 1000; }
  appendRow(values: Cell[]) { const r = this.data.length; values.forEach((v, c) => this.put(r, c, v)); return this; }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(a: number | string, col = 1, nr = 1, nc = 1) {
    const sheet = this;
    if (typeof a === 'string') { // p. ej. 'N2:N' (solo en setup)
      return { setDataValidation() { sheet.log.push(`validación ${a}`); return this; } };
    }
    const r0 = a - 1, c0 = col - 1;
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sheet.data[r0 + i]?.[c0 + j] ?? '')),
      getValue: () => sheet.data[r0]?.[c0] ?? '',
      setValues(v: Cell[][]) { v.forEach((row, i) => row.forEach((x, j) => sheet.put(r0 + i, c0 + j, x))); return this; },
      setValue(v: Cell) { sheet.put(r0, c0, v); return this; },
      setNumberFormat(f: string) { sheet.log.push(`formato ${f} col ${col}`); return this; },
      setFontWeight() { sheet.log.push('negrita'); return this; },
      setBackground() { sheet.log.push('fondo'); return this; },
      setDataValidation() { sheet.log.push('validación'); return this; },
      sort(spec: { column: number; ascending: boolean }[]) {
        const rows = sheet.data.slice(r0, r0 + nr);
        rows.sort((x, y) => { for (const s of spec) { const a1 = String(x[s.column - 1] ?? ''), b1 = String(y[s.column - 1] ?? ''); if (a1 !== b1) return (a1 < b1 ? -1 : 1) * (s.ascending ? 1 : -1); } return 0; });
        sheet.data.splice(r0, nr, ...rows);
        return this;
      },
    };
  }
  setFrozenRows() { this.log.push('fila fija'); }
  autoResizeColumns() { this.log.push('autoajuste'); }
  hideColumns() { this.log.push('ocultar columna'); }
  setColumnWidths() { this.log.push('anchos'); }
  setColumnWidth() { this.log.push('ancho'); }
  setConditionalFormatRules() { this.log.push('formato condicional'); }
}

export class FakeBook {
  sheets = new Map<string, FakeSheet>();
  log: string[] = [];
  getSheetByName(n: string) { return this.sheets.get(n) ?? null; }
  insertSheet(n: string) { const s = new FakeSheet(n); this.sheets.set(n, s); this.log.push(`crear ${n}`); return s; }
  getSheets() { return [...this.sheets.values()]; }
  deleteSheet(s: FakeSheet) { this.log.push(`BORRAR ${s.name}`); this.sheets.delete(s.name); }
  setSpreadsheetTimeZone(tz: string) { this.log.push(`zona ${tz}`); }
}

export const CITAS_HEADER = ['codigo', 'fecha', 'hora', 'fin', 'servicio_id', 'servicio', 'profesional_id', 'profesional', 'cliente', 'email', 'telefono', 'notas', 'idioma', 'estado', 'descuento_%', 'origen', 'creada', 'token'];

/** Libro con las pestañas de la hoja de prueba de helpers.mts (cabecera + filas), más ajustes extra. */
export function fixtureBook(extraSettings: Record<string, unknown> = {}, citas: Cell[][] = []) {
  const fx = fixtureSheet();
  const book = new FakeBook();
  const settings = { ...fx.settings, url_web: 'https://aurorasalon.es', email_salon: 'avisos@salon.test', enviar_emails: 'SI', ...extraSettings };
  book.sheets.set('Ajustes', new FakeSheet('Ajustes', [['clave', 'valor', 'para qué sirve'], ...Object.entries(settings).map(([k, v]) => [k, v, ''])]));
  book.sheets.set('Servicios', new FakeSheet('Servicios', [['id'], ...fx.rows.Servicios]));
  book.sheets.set('Equipo', new FakeSheet('Equipo', [['id'], ...fx.rows.Equipo]));
  book.sheets.set('Horarios', new FakeSheet('Horarios', [['dia'], ...fx.rows.Horarios]));
  book.sheets.set('Cierres', new FakeSheet('Cierres', [['fecha'], ...fx.rows.Cierres]));
  book.sheets.set('Citas', new FakeSheet('Citas', [CITAS_HEADER, ...citas]));
  return book;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Carga Code.gs con el libro falso y servicios de Google simulados (SpreadsheetApp, LockService, MailApp, Utilities).
 * A diferencia de loadCodeGs(), aquí rows() y getSetting() son los REALES de Code.gs.
 */
export function loadWithBook(book: FakeBook, opts: { now?: { date: string; minutes: number }; lockFree?: boolean; mailFails?: (to: string) => boolean } = {}) {
  const mails: any[] = [], warns: string[] = [], errors: string[] = [], alerts: string[] = [];
  let lockHeld = false, released = 0, lastWait = 0;
  const lockAtMail: boolean[] = [];
  const chain = (): any => new Proxy({}, { get: (_t, k) => (k === 'build' ? () => ({}) : () => chain()) });
  const ctx: Record<string, any> = {
    console: { log() {}, warn: (m: string) => warns.push(String(m)), error: (m: string) => errors.push(String(m)) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book, flush() {}, getUi: () => ({ alert: (m: string) => alerts.push(m) }),
      newDataValidation: chain, newConditionalFormatRule: chain,
    },
    LockService: { getScriptLock: () => ({
      tryLock: (ms: number) => { lastWait = ms; if (opts.lockFree === false) return false; lockHeld = true; return true; },
      releaseLock: () => { lockHeld = false; released++; },
    }) },
    MailApp: { sendEmail: (o: any) => { lockAtMail.push(lockHeld); if (opts.mailFails?.(o.to)) throw new Error('fallo de envío simulado'); mails.push(o); } },
    Utilities: { getUuid: () => randomUUID(), formatDate: (d: Date, _tz: string, f: string) => f
      .replace('yyyy', String(d.getFullYear())).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
      .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace(/^H$/, String(d.getHours())).replace(/^m$/, String(d.getMinutes())) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'), ctx);
  if (opts.now) { const now = opts.now; ctx.nowInSalon = () => now; }
  return { gs: ctx, mails, warns, errors, alerts, lockAtMail, lock: { get held() { return lockHeld; }, get released() { return released; }, get lastWait() { return lastWait; } } };
}

/** Crea un Date DENTRO de la sandbox (como los que devuelve Sheets), para que instanceof Date funcione. */
export const sandboxDate = (gs: any, ...args: number[]) => vm.runInContext(`new Date(${args.join(',')})`, gs);
