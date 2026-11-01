/**
 * Textos legales (Aviso legal, Privacidad, Cookies) en ES / EN / RU.
 *
 * Los datos del salón NO están aquí: los marcadores {legalName}, {cif}, {address},
 * {registry}, {email} y {phone} se rellenan en el navegador con la pestaña «Ajustes»
 * de Google Sheets (razon_social, cif, direccion, registro_mercantil, email_contacto,
 * telefono). Si un dato opcional está vacío, su línea no se muestra.
 * Revisa los textos con un asesor legal antes de publicar la web de un salón real.
 */
import type { Lang } from '../lib/booking-core';

/** Fecha de la última revisión de los textos (no es un dato del salón). */
export const legalUpdated: Record<Lang, string> = { es: '1 de noviembre de 2026', en: '1 November 2026', ru: '1 ноября 2026 г.' };

export type LegalSlug = 'aviso-legal' | 'privacidad' | 'cookies';
/** Un párrafo (string) o una lista de viñetas (string[]). */
type Block = string | string[];
export interface LegalDoc { title: string; intro: string; sections: { h: string; body: Block[] }[] }


export const legal: Record<Lang, Record<LegalSlug, LegalDoc>> = {
  es: {
    'aviso-legal': {
      title: 'Aviso legal',
      intro: 'En cumplimiento de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), te informamos de los datos del titular de esta web.',
      sections: [
        { h: '1. Titular de la web', body: [[
          `Razón social: {legalName}`,
          `CIF: {cif}`,
          `Domicilio: {address}`,
          `Inscripción: {registry}`,
          `Email: {email}`,
          `Teléfono: {phone}`,
        ]] },
        { h: '2. Objeto', body: ['Esta web informa sobre los servicios de peluquería y estética de {name} y permite reservar y cancelar citas online. Acceder a la web es gratuito y atribuye la condición de usuario, que acepta este aviso legal.'] },
        { h: '3. Uso de la web', body: ['Te comprometes a usar la web de forma lícita y a no introducir datos falsos al reservar. Podemos anular reservas que se hayan hecho de forma fraudulenta o con datos de terceros sin su permiso.'] },
        { h: '4. Reservas y cancelaciones', body: ['Las citas reservadas online quedan confirmadas al momento y no requieren pago por adelantado. Puedes cancelarlas gratis desde el enlace del email de confirmación. Si no puedes venir, te pedimos que canceles con al menos 24 horas de antelación para que otra persona pueda aprovechar el hueco. Los precios publicados son orientativos («desde») y el precio final puede variar según el largo y el estado del cabello.'] },
        { h: '5. Propiedad intelectual', body: ['Los textos, fotografías, logotipos y diseño de esta web pertenecen a {legalName} o a sus licenciantes. No está permitido copiarlos ni reutilizarlos sin autorización por escrito.'] },
        { h: '6. Responsabilidad', body: ['Trabajamos para que la información de la web sea correcta y esté actualizada, pero no podemos garantizar la ausencia de errores ni de interrupciones del servicio. No nos hacemos responsables del contenido de las webs de terceros a las que enlazamos (por ejemplo, Google Maps o Instagram).'] },
        { h: '7. Ley aplicable', body: ['Este aviso legal se rige por la legislación española. Para cualquier controversia serán competentes los juzgados y tribunales del domicilio del titular, salvo que la normativa de consumidores establezca otro fuero.'] },
      ],
    },
    privacidad: {
      title: 'Política de privacidad',
      intro: 'Cuidamos tus datos con el mismo mimo que tu pelo. Aquí te explicamos qué datos recogemos, para qué y cuáles son tus derechos, de acuerdo con el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).',
      sections: [
        { h: '1. Responsable del tratamiento', body: [[
          `{legalName} · CIF {cif}`,
          '{address}',
          `Email de contacto para privacidad: {email}`,
        ]] },
        { h: '2. Qué datos recogemos', body: ['Cuando reservas una cita: nombre y apellidos, email, teléfono móvil, el servicio, profesional, día y hora elegidos y, si las escribes, tus notas para el salón. No recogemos datos de pago ni datos especialmente protegidos. Te pedimos que no incluyas información de salud en las notas salvo que sea imprescindible (por ejemplo, una alergia a un producto).'] },
        { h: '3. Para qué los usamos', body: [[
          'Gestionar tu cita: confirmarla, enviarte un recordatorio el día anterior y permitirte cancelarla.',
          'Aplicar el descuento de bienvenida si es tu primera cita (comprobamos si tu email o teléfono ya tiene citas anteriores).',
          'Contactarte si surge un imprevisto con tu cita (por ejemplo, si la profesional se pone enferma).',
        ], 'No enviamos publicidad ni boletines sin tu consentimiento expreso, y nunca vendemos tus datos.'] },
        { h: '4. Base legal', body: ['Tratamos tus datos porque son necesarios para gestionar la cita que nos pides (art. 6.1.b RGPD) y porque aceptas esta política al reservar (art. 6.1.a RGPD).'] },
        { h: '5. Cuánto tiempo los guardamos', body: ['Guardamos los datos de tus citas mientras seas clienta o cliente del salón y, después, durante el tiempo necesario para cumplir obligaciones legales (por ejemplo, fiscales), con un máximo de 5 años desde tu última cita.'] },
        { h: '6. Con quién los compartimos', body: ['Solo con proveedores que nos ayudan a prestar el servicio y que actúan como encargados del tratamiento:', [
          'Google Ireland Ltd. (Google Workspace / Google Sheets y Gmail): agenda de citas y envío de emails de confirmación.',
          'El proveedor de alojamiento de la web.',
        ], 'Estos proveedores cumplen el RGPD. Si alguno trata datos fuera del Espacio Económico Europeo, lo hace con las garantías adecuadas (cláusulas contractuales tipo de la Comisión Europea).'] },
        { h: '7. Tus derechos', body: ['Puedes pedirnos en cualquier momento acceder a tus datos, corregirlos, borrarlos, limitar su uso, oponerte a su tratamiento o llevártelos a otro proveedor (portabilidad). Escríbenos a {email} indicando qué derecho quieres ejercer. Si consideras que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).'] },
        { h: '8. Seguridad', body: ['Aplicamos medidas técnicas y organizativas para proteger tus datos: acceso restringido a la agenda, conexión cifrada (HTTPS) y enlaces de cancelación con un código secreto único para cada cita.'] },
      ],
    },
    cookies: {
      title: 'Política de cookies',
      intro: 'Esta web usa muy pocas cookies y tecnologías similares. Te contamos cuáles y para qué.',
      sections: [
        { h: '1. ¿Qué son las cookies?', body: ['Son pequeños archivos que una web guarda en tu navegador para recordar información entre visitas. Algunas son imprescindibles para que la web funcione y otras sirven para medir o personalizar.'] },
        { h: '2. Cookies que usamos', body: [[
          'Propias: ninguna. La web no instala cookies propias ni guarda datos en tu navegador; tus reservas se guardan solo en la agenda del salón.',
          'Google Maps (terceros): el mapa de la sección «Ven a vernos» lo sirve Google y puede instalar sus propias cookies. Consulta la política de Google en policies.google.com/technologies/cookies.',
          'Google Fonts (terceros): las tipografías se cargan desde los servidores de Google, que recibe tu dirección IP para entregarlas. No instala cookies publicitarias.',
        ]] },
        { h: '3. Cookies que NO usamos', body: ['No usamos cookies de publicidad ni de seguimiento entre webs, ni compartimos tu navegación con redes sociales.'] },
        { h: '4. Cómo desactivarlas', body: ['Puedes borrar o bloquear las cookies desde la configuración de tu navegador (Chrome, Safari, Firefox, Edge…). Si bloqueas las cookies de terceros, es posible que el mapa no se muestre.'] },
        { h: '5. Cambios', body: ['Si en el futuro añadimos cookies de análisis o publicidad, actualizaremos esta política y te pediremos el consentimiento antes de instalarlas.'] },
      ],
    },
  },

  en: {
    'aviso-legal': {
      title: 'Legal notice',
      intro: 'In accordance with Spanish Law 34/2002 on Information Society Services and E-commerce (LSSI-CE), here are the details of the owner of this website.',
      sections: [
        { h: '1. Website owner', body: [[
          `Company: {legalName}`,
          `Tax ID (CIF): {cif}`,
          `Registered address: {address}`,
          `Registration: {registry}`,
          `Email: {email}`,
          `Phone: {phone}`,
        ]] },
        { h: '2. Purpose', body: ['This website provides information about the hair and beauty services of {name} and lets you book and cancel appointments online. Access is free and makes you a user who accepts this legal notice.'] },
        { h: '3. Use of the website', body: ['You agree to use the website lawfully and not to provide false details when booking. We may cancel bookings made fraudulently or with third-party details without their consent.'] },
        { h: '4. Bookings and cancellations', body: ['Online bookings are confirmed instantly and require no upfront payment. You can cancel free of charge from the link in your confirmation email. If you can’t make it, please cancel at least 24 hours in advance so someone else can take the slot. Published prices are starting prices and the final price may vary with hair length and condition.'] },
        { h: '5. Intellectual property', body: ['The texts, photographs, logos and design of this website belong to {legalName} or its licensors. They may not be copied or reused without written permission.'] },
        { h: '6. Liability', body: ['We work to keep the information on this website accurate and up to date, but we cannot guarantee it is error-free or that the service will never be interrupted. We are not responsible for the content of third-party websites we link to (for example, Google Maps or Instagram).'] },
        { h: '7. Governing law', body: ['This legal notice is governed by Spanish law. Any dispute shall be submitted to the courts of the owner’s registered address, unless consumer protection rules provide otherwise.'] },
      ],
    },
    privacidad: {
      title: 'Privacy policy',
      intro: 'We look after your data as carefully as your hair. This policy explains what data we collect, why, and what your rights are under Regulation (EU) 2016/679 (GDPR) and Spanish Organic Law 3/2018 (LOPDGDD).',
      sections: [
        { h: '1. Data controller', body: [[
          `{legalName} · Tax ID {cif}`,
          '{address}',
          `Privacy contact: {email}`,
        ]] },
        { h: '2. What data we collect', body: ['When you book: your full name, email, mobile number, the service, professional, day and time you choose and, if you write them, your notes for the salon. We do not collect payment details or special-category data. Please do not include health information in your notes unless it is essential (for example, an allergy to a product).'] },
        { h: '3. How we use it', body: [[
          'To manage your appointment: confirm it, send you a reminder the day before and let you cancel it.',
          'To apply the welcome discount if it is your first visit (we check whether your email or phone has previous bookings).',
          'To contact you if something unexpected affects your appointment (for example, if your professional is ill).',
        ], 'We never send advertising or newsletters without your express consent, and we never sell your data.'] },
        { h: '4. Legal basis', body: ['We process your data because it is necessary to manage the appointment you request (Art. 6.1.b GDPR) and because you accept this policy when booking (Art. 6.1.a GDPR).'] },
        { h: '5. How long we keep it', body: ['We keep your booking data while you are a client of the salon and afterwards for as long as required by law (for example, for tax purposes), up to a maximum of 5 years from your last appointment.'] },
        { h: '6. Who we share it with', body: ['Only with providers that help us deliver the service and act as data processors:', [
          'Google Ireland Ltd. (Google Workspace / Google Sheets and Gmail): appointment diary and confirmation emails.',
          'Our website hosting provider.',
        ], 'These providers comply with the GDPR. If any of them processes data outside the European Economic Area, it does so with appropriate safeguards (European Commission standard contractual clauses).'] },
        { h: '7. Your rights', body: ['You can ask us at any time to access, correct or delete your data, restrict or object to its processing, or receive it in a portable format. Write to {email} stating which right you wish to exercise. If you are not satisfied with our response, you can lodge a complaint with the Spanish Data Protection Agency (www.aepd.es).'] },
        { h: '8. Security', body: ['We apply technical and organisational measures to protect your data: restricted access to the diary, encrypted connections (HTTPS) and cancellation links with a unique secret code for each appointment.'] },
      ],
    },
    cookies: {
      title: 'Cookie policy',
      intro: 'This website uses very few cookies and similar technologies. Here is which ones and why.',
      sections: [
        { h: '1. What are cookies?', body: ['Small files a website stores in your browser to remember information between visits. Some are essential for the website to work; others are used for measurement or personalisation.'] },
        { h: '2. Cookies we use', body: [[
          'First-party: none. The website sets no first-party cookies and stores no data in your browser; your bookings are kept only in the salon’s diary.',
          'Google Maps (third-party): the map in the “Come and see us” section is served by Google, which may set its own cookies. See Google’s policy at policies.google.com/technologies/cookies.',
          'Google Fonts (third-party): fonts are loaded from Google’s servers, which receive your IP address to deliver them. No advertising cookies are set.',
        ]] },
        { h: '3. Cookies we do NOT use', body: ['We do not use advertising or cross-site tracking cookies, and we do not share your browsing with social networks.'] },
        { h: '4. How to disable them', body: ['You can delete or block cookies in your browser settings (Chrome, Safari, Firefox, Edge…). If you block third-party cookies, the map may not be displayed.'] },
        { h: '5. Changes', body: ['If we add analytics or advertising cookies in the future, we will update this policy and ask for your consent before setting them.'] },
      ],
    },
  },

  ru: {
    'aviso-legal': {
      title: 'Правовая информация',
      intro: 'В соответствии с испанским Законом 34/2002 об услугах информационного общества и электронной коммерции (LSSI-CE) сообщаем данные владельца сайта.',
      sections: [
        { h: '1. Владелец сайта', body: [[
          `Компания: {legalName}`,
          `ИНН (CIF): {cif}`,
          `Юридический адрес: {address}`,
          `Регистрация: {registry}`,
          `Email: {email}`,
          `Телефон: {phone}`,
        ]] },
        { h: '2. Назначение сайта', body: ['Сайт рассказывает об услугах салона {name} и позволяет записаться на приём и отменить запись онлайн. Доступ к сайту бесплатный; пользуясь им, вы принимаете эти условия.'] },
        { h: '3. Использование сайта', body: ['Вы обязуетесь пользоваться сайтом законно и указывать при записи достоверные данные. Мы можем отменить записи, сделанные обманным путём или с чужими данными без согласия их владельца.'] },
        { h: '4. Запись и отмена', body: ['Онлайн-запись подтверждается сразу и не требует предоплаты. Отменить её можно бесплатно по ссылке из письма-подтверждения. Если не получается прийти, пожалуйста, отмените запись минимум за 24 часа, чтобы время мог занять другой клиент. Указанные цены — минимальные («от»); итоговая стоимость зависит от длины и состояния волос.'] },
        { h: '5. Интеллектуальная собственность', body: ['Тексты, фотографии, логотипы и дизайн сайта принадлежат {legalName} или её лицензиарам. Копировать и использовать их без письменного разрешения запрещено.'] },
        { h: '6. Ответственность', body: ['Мы стараемся, чтобы информация на сайте была точной и актуальной, но не можем гарантировать отсутствие ошибок или перебоев в работе. Мы не отвечаем за содержание сторонних сайтов, на которые ссылаемся (например, Google Maps или Instagram).'] },
        { h: '7. Применимое право', body: ['Настоящие условия регулируются законодательством Испании. Споры рассматриваются судами по месту нахождения владельца сайта, если законы о защите прав потребителей не предусматривают иное.'] },
      ],
    },
    privacidad: {
      title: 'Политика конфиденциальности',
      intro: 'Мы бережём ваши данные так же, как ваши волосы. Здесь мы объясняем, какие данные собираем, зачем и какие у вас есть права согласно Регламенту (ЕС) 2016/679 (GDPR) и испанскому Органическому закону 3/2018 (LOPDGDD).',
      sections: [
        { h: '1. Оператор данных', body: [[
          `{legalName} · CIF {cif}`,
          '{address}',
          `Контакт по вопросам конфиденциальности: {email}`,
        ]] },
        { h: '2. Какие данные мы собираем', body: ['При записи: имя и фамилия, email, мобильный телефон, выбранные услуга, мастер, день и время, а также ваш комментарий для салона, если вы его оставили. Мы не собираем платёжные данные и данные особых категорий. Пожалуйста, не указывайте в комментарии сведения о здоровье, если это не обязательно (например, аллергия на средство).'] },
        { h: '3. Для чего мы их используем', body: [[
          'Чтобы вести вашу запись: подтвердить её, напомнить о визите накануне и дать возможность отменить.',
          'Чтобы применить приветственную скидку на первый визит (проверяем, были ли записи с вашим email или телефоном).',
          'Чтобы связаться с вами, если с записью что-то изменится (например, если мастер заболел).',
        ], 'Мы не отправляем рекламу и рассылки без вашего явного согласия и никогда не продаём ваши данные.'] },
        { h: '4. Правовое основание', body: ['Мы обрабатываем данные, потому что это необходимо для выполнения вашей записи (ст. 6.1.b GDPR), и потому что вы принимаете эту политику при записи (ст. 6.1.a GDPR).'] },
        { h: '5. Срок хранения', body: ['Мы храним данные о записях, пока вы остаётесь клиентом салона, а затем столько, сколько требует закон (например, налоговый), но не дольше 5 лет с даты последнего визита.'] },
        { h: '6. Кому мы их передаём', body: ['Только поставщикам, которые помогают нам оказывать услугу и действуют как обработчики данных:', [
          'Google Ireland Ltd. (Google Workspace / Google Таблицы и Gmail): журнал записей и письма-подтверждения.',
          'Хостинг-провайдер сайта.',
        ], 'Эти поставщики соблюдают GDPR. Если кто-то из них обрабатывает данные за пределами Европейской экономической зоны, это происходит с надлежащими гарантиями (типовые договорные условия Европейской комиссии).'] },
        { h: '7. Ваши права', body: ['Вы в любой момент можете запросить доступ к своим данным, их исправление или удаление, ограничение обработки, возразить против неё или получить данные в переносимом формате. Напишите на {email}, указав, каким правом хотите воспользоваться. Если вас не устроит наш ответ, вы можете подать жалобу в Испанское агентство по защите данных (www.aepd.es).'] },
        { h: '8. Безопасность', body: ['Мы применяем технические и организационные меры защиты: ограниченный доступ к журналу записей, шифрованное соединение (HTTPS) и ссылки для отмены с уникальным секретным кодом для каждой записи.'] },
      ],
    },
    cookies: {
      title: 'Политика cookies',
      intro: 'Сайт использует очень мало cookies и похожих технологий. Рассказываем, какие и зачем.',
      sections: [
        { h: '1. Что такое cookies?', body: ['Это небольшие файлы, которые сайт сохраняет в браузере, чтобы помнить информацию между визитами. Одни необходимы для работы сайта, другие — для статистики или персонализации.'] },
        { h: '2. Какие cookies мы используем', body: [[
          'Собственные: нет. Сайт не устанавливает собственные cookies и не сохраняет данные в браузере; записи хранятся только в журнале салона.',
          'Google Maps (сторонние): карту в разделе «Приходите к нам» показывает Google, который может устанавливать свои cookies. Политика Google: policies.google.com/technologies/cookies.',
          'Google Fonts (сторонние): шрифты загружаются с серверов Google, которые получают ваш IP-адрес, чтобы их передать. Рекламные cookies не устанавливаются.',
        ]] },
        { h: '3. Какие cookies мы НЕ используем', body: ['Мы не используем рекламные cookies и cookies для отслеживания между сайтами и не передаём данные о ваших посещениях социальным сетям.'] },
        { h: '4. Как их отключить', body: ['Вы можете удалить или заблокировать cookies в настройках браузера (Chrome, Safari, Firefox, Edge…). Если заблокировать сторонние cookies, карта может не отображаться.'] },
        { h: '5. Изменения', body: ['Если в будущем мы добавим аналитические или рекламные cookies, мы обновим эту политику и попросим ваше согласие до их установки.'] },
      ],
    },
  },
};

export const legalUi: Record<Lang, { updated: string; back: string; other: string }> = {
  es: { updated: 'Última actualización', back: 'Volver a la web', other: 'Otros textos legales' },
  en: { updated: 'Last updated', back: 'Back to the website', other: 'Other legal texts' },
  ru: { updated: 'Последнее обновление', back: 'Вернуться на сайт', other: 'Другие документы' },
};
