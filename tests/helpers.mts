/**
 * Utilidades de prueba. Ejecuta apps-script/Code.gs en una sandbox de Node con la
 * hoja simulada en memoria (filas como las que devuelve Google Sheets).
 * Estos datos son SOLO para las pruebas: la web nunca los lee.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export type SheetRows = Record<string, unknown[][]>;
export type Settings = Record<string, string | number>;

/** Pestañas de una hoja de prueba (mismo formato y columnas que la hoja real). */
export function fixtureSheet(): { rows: SheetRows; settings: Settings } {
  return {
    settings: {
      nombre_salon: 'Salón de Prueba', direccion: 'Calle Falsa, 1 · Ciudad de Prueba', telefono: '+34 600 000 000',
      email_contacto: '', instagram: '', razon_social: '', cif: '', registro_mercantil: '',
      intervalo_minutos: 30, dias_reserva: 30, antelacion_horas: 2, descuento_nuevos: 10
    },
    rows: {
      Servicios: [
        // id, nombre_es, nombre_en, nombre_ru, desc_es, desc_en, desc_ru, duracion_min, precio_desde, visible, imagen, posicion_imagen
        ['corte', 'Corte', 'Cut', 'Стрижка', 'd', 'd', 'd', 75, 30, 'SI', 'a.jpg', '50% 30%'],
        ['corte45', 'Corte corto', '', '', 'd', '', '', 45, 20, 'SI', '', ''],
        ['semi', 'Semipermanente', '', '', 'd', '', '', 50, 28, 'SI', '', ''],
        ['cejas', 'Cejas', '', '', 'd', '', '', 30, 15, 'SI', '', ''],
        ['oculto', 'Borrador', '', '', '', '', '', '', '', 'NO', '', '']
      ],
      Equipo: [
        // id, nombre, rol_es, rol_en, rol_ru, servicios, dias, activo
        ['ana', 'Ana Prueba', 'Estilista', '', '', 'corte, corte45', 'mar, mie, jue, vie, sab', 'SI'],
        ['bea', 'Bea Prueba', 'Colorista', '', '', 'corte, corte45', 'lun, mar, mie, jue, vie', 'SI'],
        ['cris', 'Cris Prueba', 'Esteticista', '', '', 'semi, cejas', 'lun, mie, jue, vie, sab', 'SI'],
        ['baja', 'De Baja', 'Estilista', '', '', 'corte', 'lun, mar, mie, jue, vie', 'NO']
      ],
      Horarios: [
        ['lunes', '09:30', '20:00', '14:00', '15:00'], ['martes', '09:30', '20:00', '14:00', '15:00'],
        ['miércoles', '09:30', '20:00', '14:00', '15:00'], ['jueves', '09:30', '20:00', '14:00', '15:00'],
        ['viernes', '09:30', '20:00', '14:00', '15:00'], ['sábado', '09:30', '14:00', '', ''], ['domingo', '', '', '', '']
      ],
      Cierres: [['2026-12-08', 'Festivo']],
      Citas: []
    }
  };
}

/** Carga Code.gs con la hoja simulada. `now` = fecha/minuto «actuales» del salón. */
export function loadCodeGs(sheet = fixtureSheet(), now = { date: '2026-11-02', minutes: 600 }) {
  const ctx: Record<string, any> = {
    console,
    Utilities: { formatDate: () => '00' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8'), ctx);
  ctx.rows = (name: string) => sheet.rows[name] ?? [];
  ctx.getSetting = (key: string, fallback: unknown) => {
    const v = sheet.settings[key];
    return v === undefined || v === '' ? fallback : v;
  };
  ctx.nowInSalon = () => now;
  return ctx;
}

/** Objeto JS «limpio» (los objetos de la sandbox tienen otro prototipo). */
export const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/**
 * Importa src/lib/booking-api.ts en Node: sustituye import.meta.env (lo pone Vite) por una
 * variable global, la ruta de booking-core por una URL absoluta y acorta el tiempo límite.
 */
export async function importBookingApi(apiUrl: string) {
  const src = fs.readFileSync(path.join(root, 'src/lib/booking-api.ts'), 'utf8')
    .replace('import.meta.env.PUBLIC_BOOKING_API_URL', '(globalThis as any).__API_URL')
    .replace("from './booking-core'", `from '${pathToFileURL(path.join(root, 'src/lib/booking-core.ts')).href}'`)
    .replace('const TIMEOUT_MS = 20000', 'const TIMEOUT_MS = 300');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-test-')), 'booking-api.ts');
  fs.writeFileSync(file, src);
  (globalThis as any).__API_URL = apiUrl;
  return import(pathToFileURL(file).href);
}
