# Aurora Beauty Salon — web + motor de reservas

Web de un salón de belleza en **Astro**, en **español, inglés y ruso**, con un **motor de reservas propio** que guarda las citas en una **hoja de Google Sheets**. Sin base de datos, sin servidor y sin login para el equipo: el salón gestiona servicios, precios, horarios y agenda desde la propia hoja.

Diseño: dirección **B · Perla**, versión con secciones alternas verde / gris.

---

## Qué incluye

| | |
|---|---|
| 🌐 **Web pública** | Hero con descuento para clientes nuevos, carrusel de servicios, sección de reservas, el salón, contacto con mapa y footer. |
| 🗣️ **3 idiomas** | `/` español · `/en/` inglés · `/ru/` ruso. Selector de idioma en el header. |
| 📅 **Reserva en 5 pasos** | Servicio → Profesional (opcional, «Me da igual») → Fecha y hora → Tus datos → Confirmación. |
| ✅ **Huecos reales** | Tiene en cuenta horario, descanso, festivos, días de cada profesional, duración del servicio y citas ya reservadas. |
| 🔒 **Sin dobles reservas** | Antes de guardar, el servidor vuelve a comprobar el hueco con un bloqueo (`LockService`). |
| ✉️ **Emails** | Confirmación a la clienta en su idioma, aviso al salón y recordatorio el día anterior (opcional). |
| ❌ **Cancelar en un clic** | Enlace en el email → página «Tu cita» → botón **Cancelar**. El hueco se libera al momento. |
| 🎁 **−10 % clientes nuevos** | Se aplica solo si el email o el teléfono no tienen citas anteriores. |
| 📆 **Añadir al calendario** | Descarga un `.ics` compatible con Google, Apple y Outlook. |
| 🚨 **Errores reales** | Las reservas van **solo** a Google Sheets. Si algo falla (sin conexión, Google tarda, hoja ocupada, error del script) la web lo dice claramente y ofrece reintentar o llamar. Nunca crea citas ficticias. |

---

## Empezar

Necesitas **Node.js 18.20 o superior** y la hoja de Google conectada (ver la sección siguiente): **no hay modo demo**.

```bash
npm install
cp .env.example .env   # y pega la URL /exec de Apps Script en PUBLIC_BOOKING_API_URL
npm run dev
```

Abre <http://localhost:4321>. Las reservas que hagas se guardan en la hoja **de verdad** (y envían emails): usa tus propios datos para probar y cancela después.

> Sin `PUBLIC_BOOKING_API_URL`, `npm run dev` arranca con un aviso y el modal muestra un error; `npm run build` **falla** a propósito para que nunca se publique una web que no puede reservar.

Otros comandos:

```bash
npm run build     # genera la web estática en dist/
npm run preview   # sirve dist/ para comprobarla antes de publicar
```

---

## Conectar Google Sheets (obligatorio)

👉 Guía paso a paso: **[docs/GOOGLE-SHEETS.md](docs/GOOGLE-SHEETS.md)** (unos 10 minutos).

Resumen:

1. Crea una hoja de cálculo vacía en Google Drive.
2. **Extensiones → Apps Script**, pega `apps-script/Code.gs` y guarda.
3. Recarga la hoja → menú **Aurora → 1 · Preparar hoja**. Se crean las pestañas con datos de ejemplo.
4. En Apps Script: **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. Copia la URL que termina en `/exec` y pégala en `.env`:

   ```bash
   cp .env.example .env
   # PUBLIC_BOOKING_API_URL=https://script.google.com/macros/s/XXXX/exec
   # PUBLIC_ADMIN_URL=https://docs.google.com/spreadsheets/d/XXXX/edit
   ```

6. `npm run build` y publica. ¡Listo!

---

## Cómo trabaja el salón con la hoja

| Pestaña | Para qué |
|---|---|
| **Citas** | La agenda. Cada reserva web añade una fila ordenada por fecha. **Cancelar = elegir «Cancelada» en Estado.** Si llaman por teléfono, añade una fila a mano (fecha `2026-11-04`, hora `16:30`, servicio_id y profesional) y ese hueco deja de ofrecerse en la web. |
| **Servicios** | El «CMS»: nombre y descripción en ES/EN/RU, duración, precio «desde», `visible` SI/NO e imagen. Los cambios se ven en la web al recargar, sin volver a publicar. |
| **Equipo** | Profesionales, qué servicios hacen (por `id`) y qué días trabajan. `activo` = NO para vacaciones largas. |
| **Horarios** | Apertura, cierre y descanso de cada día. Deja vacío para cerrado. |
| **Cierres** | Festivos y vacaciones del salón. |
| **Ajustes** | Datos del salón que muestra la web (nombre, dirección, teléfono, email público, Instagram, datos legales), email de avisos, URL de la web, intervalo de huecos, días de reserva, antelación mínima, % de descuento, enviar emails SI/NO. |

> **Google Sheets es la única fuente de datos.** Contacto, servicios, precios, duraciones, imágenes, equipo, horarios, descansos, cierres y reglas de reserva se leen de la hoja cada vez que se abre la web. No hay copia local: si la hoja no responde, la web muestra «No hemos podido cargar los datos» con un botón **Reintentar** y no deja reservar.
>
> Ajustes **obligatorios** (si faltan, la web muestra el error): `nombre_salon`, `direccion`, `telefono`, `intervalo_minutos`, `dias_reserva`, `antelacion_horas`, `descuento_nuevos`. **Opcionales** (si están vacíos, ese dato no se muestra): `email_contacto`, `instagram`, `razon_social`, `cif`, `registro_mercantil`. El menú **Aurora → Añadir ajustes que faltan** añade las filas que no tengas, vacías, sin tocar las demás.
>
> En **Servicios**, cada servicio visible necesita `duracion_min` y `precio_desde`. Columna opcional L `posicion_imagen` (p. ej. `50% 30%`) para encuadrar la foto.

> **Cómo se calculan las horas libres:** las citas empiezan cada `intervalo_minutos` (30 por defecto) y, además, justo a la hora en que termina cada cita de esa profesional (p. ej. 11:15 tras un corte de 75 min a las 10:00). No hay margen extra entre citas: la `duracion_min` de cada servicio debe incluir ya la limpieza y preparación del puesto.

> El botón **Iniciar sesión** del header abre `PUBLIC_ADMIN_URL`. Con esta opción, pon ahí el enlace de la hoja: solo entra quien tenga permiso en Google Drive.

---

## Estructura del proyecto

```
aurora-salon/
├── apps-script/
│   ├── Code.gs              ← backend: pégalo en Apps Script
│   └── appsscript.json      ← manifiesto (zona horaria, permisos)
├── docs/GOOGLE-SHEETS.md    ← guía de conexión paso a paso
├── tests/                   ← pruebas (`npm test`): catálogo, disponibilidad y errores
├── public/images/           ← fotos del salón
├── src/
│   ├── components/          ← Header, Hero, Services, BookingModal, CitaPage…
│   ├── data/legal.ts        ← textos legales; los datos del salón se rellenan desde la hoja
│   ├── i18n/ui.ts           ← todos los textos en ES / EN / RU
│   ├── lib/
│   │   ├── booking-core.ts  ← tipos, fechas y copia del cálculo de huecos de Code.gs
│   │   ├── booking-api.ts   ← cliente de Google Sheets (errores, tiempo límite, reintentos)
│   │   ├── site-data.ts     ← carga única de la hoja y relleno de la página
│   │   └── format.ts        ← fechas por idioma, .ics
│   ├── pages/               ← / , /cita , /en/… , /ru/…
│   └── styles/global.css    ← colores, botones perla, degradados
└── .env.example
```

---

## Personalizar

- **Textos e idiomas**: `src/i18n/ui.ts`. Cada clave existe en `es`, `en` y `ru`.
- **Dirección, teléfono, email, Instagram, descuento, servicios, equipo, horarios**: en la hoja (no en el código).
- **Mapa**: en `src/components/Contact.astro`, `useGoogleMap` (mapa real de Google o ilustrado) y `mapZoom`. El mapa busca la `direccion` de la hoja.
- **Colores y tipografías**: variables al principio de `src/styles/global.css`.
  Fuentes: *Italiana* (títulos), *Source Sans 3* (texto), *Comfortaa* (números), *Petit Formal Script* (solo «−10 %»).
- **Nuevo servicio con foto**: añádelo en la hoja. Si quieres foto propia, sube la imagen a `public/images/` y escribe su nombre en la columna `imagen` (o una URL completa). La tarjeta aparece sola en el carrusel.

---

## Publicar

Es una web **100 % estática** (`dist/`), así que sirve cualquier hosting gratuito:

- **Netlify / Vercel / Cloudflare Pages**: conecta el repositorio, comando `npm run build`, carpeta `dist`. Añade `PUBLIC_BOOKING_API_URL` y `PUBLIC_ADMIN_URL` en *Environment variables*.
- Cambia `site` en `astro.config.mjs` por tu dominio y `url_web` en la pestaña **Ajustes** de la hoja (para que el enlace de cancelar del email apunte bien).

---

## Límites de esta opción (y cuándo pasar a base de datos)

Google Sheets + Apps Script es perfecto para **un salón con volumen normal** (decenas de citas al día). Ten en cuenta:

- **Cuotas de Google**: una cuenta gratuita envía unos **100 emails al día** (Workspace: 1500). Cada reserva gasta 2 (clienta + salón).
- **Velocidad**: cada petición tarda ~1–2 s. La web muestra «Buscando huecos libres…» mientras tanto.
- **Privacidad (RGPD)**: la hoja contiene datos personales. Compártela solo con el equipo y añade la política de privacidad real.
- **Integridad**: si alguien borra filas de «Citas» a mano, esas citas se pierden. Para cancelar, cambia el Estado y no borres la fila.

Si el salón crece (varios centros, app para el equipo, pagos online), la misma web puede pasar a **Supabase / PostgreSQL**: solo hay que reescribir `src/lib/booking-api.ts`. El resto de la web no cambia.

---

## Comprobado

- Reserva completa en los 3 idiomas, con validación de campos obligatorios.
- «Me da igual» asigna la primera profesional libre.
- Dos reservas al mismo hueco: la segunda recibe «alguien acaba de reservar esa hora» y vuelve a elegir.
- Cancelación desde el enlace: el hueco vuelve a estar disponible.
- Un token incorrecto no puede cancelar citas ajenas.
