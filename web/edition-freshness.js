const STALE_AFTER_DAYS = 30;

export function formatUpdatedAt(value, now = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Refresh date unavailable';
  const exactTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  if (date.getTime() > now) return `Edition timestamp is in the future · ${exactTime}`;
  const elapsedSeconds = (now - date.getTime()) / 1000;
  let amount;
  let unit;
  if (elapsedSeconds < 45) return `Updated just now · ${exactTime}`;
  if (elapsedSeconds < 90) [amount, unit] = [1, 'minute'];
  else if (elapsedSeconds < 60 * 60) [amount, unit] = [Math.round(elapsedSeconds / 60), 'minute'];
  else if (elapsedSeconds < 90 * 60) [amount, unit] = [1, 'hour'];
  else if (elapsedSeconds < 24 * 60 * 60) [amount, unit] = [Math.round(elapsedSeconds / (60 * 60)), 'hour'];
  else if (elapsedSeconds < 36 * 60 * 60) [amount, unit] = [1, 'day'];
  else if (elapsedSeconds < 30 * 24 * 60 * 60) [amount, unit] = [Math.round(elapsedSeconds / (24 * 60 * 60)), 'day'];
  else if (elapsedSeconds < 45 * 24 * 60 * 60) [amount, unit] = [1, 'month'];
  else if (elapsedSeconds < 365 * 24 * 60 * 60) [amount, unit] = [Math.round(elapsedSeconds / (30 * 24 * 60 * 60)), 'month'];
  else if (elapsedSeconds < 545 * 24 * 60 * 60) [amount, unit] = [1, 'year'];
  else [amount, unit] = [Math.round(elapsedSeconds / (365 * 24 * 60 * 60)), 'year'];
  const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-amount, unit);
  return `Updated ${relativeTime} · ${exactTime}`;
}

export function editionFreshness(refreshedAt, now = Date.now()) {
  const refreshedTime = Date.parse(refreshedAt);
  if (!Number.isFinite(refreshedTime)) return { stale: false, ageDays: null };
  const ageDays = Math.max(0, Math.floor((now - refreshedTime) / 86_400_000));
  return { stale: ageDays >= STALE_AFTER_DAYS, ageDays };
}

export function updateEditionFreshness(element, refreshedAt, now = Date.now()) {
  const freshness = editionFreshness(refreshedAt, now);
  element.hidden = !freshness.stale;
  if (freshness.stale) {
    element.querySelector('#edition-stale-age').textContent = `This snapshot is ${freshness.ageDays} days old.`;
  }
  return freshness;
}
