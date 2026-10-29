const STALE_AFTER_DAYS = 30;

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
