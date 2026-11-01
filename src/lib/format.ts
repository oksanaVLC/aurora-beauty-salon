import { ui } from '../i18n/ui';
import { weekday, toMin, toHHMM, type Booking, type Lang, type Service } from './booking-core';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const list = (lang: Lang, key: 'wd.short' | 'wd.long' | 'months' | 'months.short') => ui[lang][key].split('|');

export function formatDayParts(date: string, lang: Lang) {
  const [, m, d] = date.split('-').map(Number);
  const wd = weekday(date);
  const monthsNominative: Record<Lang, string[]> = {
    es: list('es', 'months'),
    en: list('en', 'months'),
    ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
  };
  return {
    day: d,
    wdShort: list(lang, 'wd.short')[wd],
    wdLong: list(lang, 'wd.long')[wd],
    monShort: list(lang, 'months.short')[m - 1],
    monthLong: monthsNominative[lang][m - 1] + ' ' + date.slice(0, 4)
  };
}

/** «martes, 4 de noviembre» / «Tuesday 4 November» / «вторник, 4 ноября» */
export function formatDateLong(date: string, lang: Lang): string {
  const [, m, d] = date.split('-').map(Number);
  const wd = list(lang, 'wd.long')[weekday(date)];
  const month = list(lang, 'months')[m - 1];
  const out = lang === 'es' ? `${wd}, ${d} de ${month}` : lang === 'ru' ? `${wd}, ${d} ${month}` : `${wd} ${d} ${month}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Descarga un .ics para añadir la cita a Google Calendar, Apple o Outlook. */
export function downloadIcs(b: Booking, svc: Service, salonName: string, address: string, lang: Lang) {
  const dt = (date: string, time: string) => date.replace(/-/g, '') + 'T' + time.replace(':', '') + '00';
  const end = b.end || toHHMM(toMin(b.time) + svc.duration);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aurora Beauty Salon//Reservas//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${b.code}@aurorasalon`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Madrid:${dt(b.date, b.time)}`,
    `DTEND;TZID=Europe/Madrid:${dt(b.date, end)}`,
    `SUMMARY:${(svc.name[lang] || svc.name.es)} · ${salonName}`,
    `LOCATION:${address.replace(/,/g, '\\,')}`,
    `DESCRIPTION:${b.code}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `aurora-${b.code}.ics` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
