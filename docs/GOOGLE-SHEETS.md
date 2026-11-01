# Conectar la web con Google Sheets

Tiempo: **10 minutos**. Solo necesitas una cuenta de Google (mejor la del salón, porque los emails saldrán desde ella).

Al terminar tendrás:

- una hoja de cálculo que es la **agenda y el panel** del salón;
- una URL `…/exec` que la web usa para leer huecos y guardar citas.

---

## Paso 1 · Crear la hoja

1. Entra en <https://sheets.new> (crea una hoja vacía).
2. Ponle nombre arriba a la izquierda, por ejemplo **Aurora — Reservas**.

## Paso 2 · Pegar el script

1. En la hoja: menú **Extensiones → Apps Script**. Se abre el editor en otra pestaña.
2. Borra todo lo que hay en `Código.gs` y pega el contenido completo de [`apps-script/Code.gs`](../apps-script/Code.gs).
3. (Recomendado) Rueda dentada **⚙ Configuración del proyecto** → marca **«Mostrar el archivo de manifiesto appsscript.json»**. Abre `appsscript.json` en el editor y sustituye su contenido por el de [`apps-script/appsscript.json`](../apps-script/appsscript.json). Así la zona horaria queda en `Europe/Madrid`.
4. Pulsa **💾 Guardar**.

## Paso 3 · Preparar las pestañas

1. Vuelve a la pestaña de la hoja y **recárgala** (F5). Tras unos segundos aparece el menú **Aurora** junto a «Ayuda».
2. **Aurora → 1 · Preparar hoja (primera vez)**.
3. Google pide permisos la primera vez:
   - **Continuar** → elige tu cuenta.
   - Si ves «Google no ha verificado esta aplicación»: **Configuración avanzada → Ir a … (no seguro)**. Es normal: el script es tuyo y solo tú lo usas.
   - **Permitir**.
4. Vuelve a pulsar **Aurora → 1 · Preparar hoja**. Se crean las pestañas *Ajustes, Servicios, Equipo, Horarios, Cierres y Citas* con los datos de ejemplo de Aurora.
5. En **Ajustes**, revisa:
   - `nombre_salon`, `direccion`, `telefono` (obligatorios) y `email_contacto`, `instagram`, `razon_social`, `cif`, `registro_mercantil` (opcionales) → es lo que muestra la web: contacto, pie, páginas legales;
   - `email_salon` → donde llegan los avisos de citas nuevas y cancelaciones (no se muestra en la web);
   - `url_web` → la dirección de tu web **sin barra final** (por ejemplo `https://aurorasalon.es`). Es la base del enlace «Cancelar» de los emails.

## Paso 4 · Publicar como aplicación web

1. En el editor de Apps Script: botón azul **Implementar → Nueva implementación**.
2. Rueda dentada junto a «Seleccionar tipo» → **Aplicación web**.
3. Rellena:
   - Descripción: `Reservas v1`
   - **Ejecutar como: Yo** (tu cuenta)
   - **Quién tiene acceso: Cualquier usuario**. Hace falta para que las clientas reserven sin iniciar sesión en Google. Ellas solo pueden hacer lo que el script permite: ver huecos, reservar y cancelar con su código secreto. **No pueden ver la hoja.**
4. **Implementar** y copia la **URL de la aplicación web**. Es así:

   ```
   https://script.google.com/macros/s/AKfycb…larguísimo…/exec
   ```

5. Compruébala: ábrela en el navegador añadiendo `?action=ping` al final. Debe responder:

   ```json
   {"ok":true,"salon":"Aurora Beauty Salon"}
   ```

## Paso 5 · Decírselo a la web

En la carpeta del proyecto:

```bash
cp .env.example .env
```

Edita `.env`:

```bash
PUBLIC_BOOKING_API_URL=https://script.google.com/macros/s/AKfycb…/exec
PUBLIC_ADMIN_URL=https://docs.google.com/spreadsheets/d/…/edit
```

Después:

```bash
npm run dev      # para probar en local
npm run build    # para publicar
```

En el hosting (Netlify, Vercel…) añade las mismas dos variables en *Environment variables*.

**Prueba final**: haz una reserva en la web. Debe aparecer una fila en **Citas** y llegarte el email. Pulsa «Ver o cancelar mi cita» en el email → **Cancelar**. En la hoja, el Estado pasa a **Cancelada**.

---

## Extras opcionales

### Recordatorio el día anterior
Menú **Aurora → Activar recordatorios diarios**. Cada día a las 10:00 se envía un email a las citas del día siguiente, con el enlace para cancelar.

### Cambiar el código del script más adelante
Si editas `Code.gs`, la web no ve los cambios hasta que los publicas:
**Implementar → Gestionar implementaciones → ✏️ editar → Versión: «Nueva versión» → Implementar**.
Así **la URL `/exec` no cambia** y no tienes que tocar la web.

> ⚠️ Si usas «Nueva implementación» en lugar de editar la existente, se crea una URL nueva y tendrás que actualizar `PUBLIC_BOOKING_API_URL`.

### Que el equipo use la hoja desde el móvil
Instalad la app **Google Sheets** y compartid la hoja con cada profesional (**Compartir → Editor**). Para que cada una vea solo sus citas: en **Citas**, menú **Datos → Crear una vista con filtro** por la columna *profesional*.

---

## Reglas de uso para el salón

- **Cancelar**: cambia **Estado** a «Cancelada». **No borres filas**, porque se pierde el historial y el descuento de bienvenida dejaría de funcionar bien.
- **Cita por teléfono**: añade una fila nueva con **fecha** (`2026-11-04`), **hora** (`16:30`), **servicio_id** (por ejemplo `corte`), **profesional** (nombre), **cliente**, **telefono** y **Estado** = Confirmada. Ese hueco desaparece de la web al momento. Si no pones profesional, el hueco se bloquea para todas.
- **Cambiar un precio**: pestaña **Servicios**, columna `precio_desde`. Se ve en la web al recargar.
- **Ocultar un servicio**: `visible` = NO.
- **Vacaciones de una profesional**: **Equipo → activo** = NO, o quita los días.
- **Festivo**: añade la fecha en **Cierres**.

---

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `npm run build` falla con «Falta PUBLIC_BOOKING_API_URL» | Pega la URL `/exec` en `.env` (o en las *Environment variables* del hosting) y vuelve a hacer `build`. |
| El modal dice «El sistema de reservas no responde» | Abre `TU_URL/exec?action=ping`: debe devolver `{"ok":true,…}`. Si pide iniciar sesión o da error, revisa la implementación y **Apps Script → Ejecuciones**. |
| «No sabemos si tu cita se ha guardado» | La petición se cortó o tardó más de 20 s. Mira la pestaña **Citas**: si la fila está, la cita es válida y el email de confirmación debería haber llegado. |
| `?action=ping` pide iniciar sesión | En la implementación, «Quién tiene acceso» no es **Cualquier usuario**. Edítala. |
| La web dice «No hemos podido cargar los datos del salón» | Abre `TU_URL/exec?action=catalog`. Si responde `{"ok":false,…,"message":"Falta el ajuste obligatorio…"}` o «Servicio …: duracion_min vacía», corrige esa celda de la hoja. Si no aparece `"salon"`, pega el `Code.gs` nuevo y publica una nueva versión. |
| Hoja antigua sin los ajustes nuevos | Menú **Aurora → Añadir ajustes que faltan (no borra nada)** y rellena las filas añadidas. |
| No llegan emails | Revisa `enviar_emails` = SI en **Ajustes**. Mira **Apps Script → Ejecuciones** para ver errores. Cuenta gratuita: unos 100 emails al día. |
| El enlace de cancelar va a otra web | Corrige `url_web` en **Ajustes** (sin barra final). |
| Las horas aparecen desplazadas | Las columnas de fecha y hora de **Citas** y **Horarios** deben estar en formato texto. «Preparar hoja» lo hace solo; si añadiste columnas a mano, usa **Formato → Número → Texto sin formato**. |
| Cambié el script y no pasa nada | Publica una nueva versión de la misma implementación (ver «Cambiar el código»). |
