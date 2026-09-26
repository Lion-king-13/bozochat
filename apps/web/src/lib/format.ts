/**
 * Formatage des dates en français — `Intl` uniquement, aucune dépendance ajoutée.
 * Toutes les fonctions reçoivent une date ISO telle que renvoyée par l'API.
 */

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDayFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });

const MS_PER_DAY = 86_400_000;

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Nombre de jours civils écoulés depuis `date` (0 = aujourd'hui, 1 = hier). */
function daysAgo(date: Date): number {
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / MS_PER_DAY);
}

/** Heure d'un message, ex. « 14:32 ». */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** Séparateur de jour dans l'historique : « Aujourd’hui », « Hier », sinon la date complète. */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const days = daysAgo(date);
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Hier';
  return dayFormat.format(date);
}

/** Horodatage compact de la liste des conversations : heure aujourd'hui, « Hier », sinon jj/mm. */
export function formatListTimestamp(iso: string): string {
  const date = new Date(iso);
  const days = daysAgo(date);
  if (days === 0) return timeFormat.format(date);
  if (days === 1) return 'Hier';
  return shortDayFormat.format(date);
}

/** Deux messages tombent-ils le même jour civil ? (séparateurs de jour) */
export function isSameDay(isoA: string, isoB: string): boolean {
  return startOfDay(new Date(isoA)) === startOfDay(new Date(isoB));
}

/** Initiales pour l'avatar de repli quand `avatarUrl` est absent. */
export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return (last ? `${first[0] ?? ''}${last[0] ?? ''}` : first.slice(0, 2)).toUpperCase();
}
