export function runtimeLabelFor(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) return '';
  if (minutes < 1440) return `${minutes.toLocaleString()} min`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  return [days ? `${days.toLocaleString()}d` : '', hours ? `${hours}h` : '', remainingMinutes ? `${remainingMinutes}m` : ''].filter(Boolean).join(' ');
}
