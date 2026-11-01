// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

/** Carpeta del proyecto a partir de la URL `file:` que da Astro (sin depender de los tipos de Node). */
const rootDir = (/** @type {URL} */ url) => decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1');

/**
 * Las reservas y todos los datos del salón salen SOLO de Google Sheets. Sin PUBLIC_BOOKING_API_URL:
 *  - `npm run build` falla (así nunca se publica una web sin datos ni reservas);
 *  - `npm run dev` arranca con un aviso, y la web muestra el error de carga.
 * `loadEnv` lee el .env y también las variables PUBLIC_* del entorno (p. ej. las del hosting).
 * @type {import('astro').AstroIntegration}
 */
const requireBookingApi = {
  name: 'aurora-require-booking-api',
  hooks: {
    'astro:config:setup': ({ command, config, logger }) => {
      const env = loadEnv(command === 'build' ? 'production' : 'development', rootDir(config.root), 'PUBLIC_');
      const url = (env.PUBLIC_BOOKING_API_URL || '').trim();
      if (/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) return;
      const msg = url
        ? `PUBLIC_BOOKING_API_URL no parece una URL de Apps Script (debe ser https://script.google.com/macros/s/…/exec): ${url}`
        : 'Falta PUBLIC_BOOKING_API_URL en .env (URL /exec de Google Apps Script). Ver docs/GOOGLE-SHEETS.md.';
      if (command === 'build') throw new Error(msg);
      logger.warn(msg);
    }
  }
};

// https://docs.astro.build/en/guides/internationalization/
export default defineConfig({
  // Cambia esto por tu dominio real (se usa para el sitemap y las URLs canónicas)
  site: 'https://aurorasalon.es',
  integrations: [requireBookingApi],
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en', 'ru'],
    routing: { prefixDefaultLocale: false }
  }
});
