function decodedPathPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sourceListIdentity(url) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length < 3 || parts[1] !== 'list' || !parts[2]) return null;
    const username = decodedPathPart(parts[0]);
    const slug = decodedPathPart(parts[2]);
    const label = slug.replace(/[-_]+/g, ' ').replace(/(^|\s)\p{L}/gu, (part) => part.toLocaleUpperCase());
    const displayLabel = (label || 'Letterboxd list').normalize('NFC');
    return { username, slug, key: displayLabel.toLocaleLowerCase(), label: displayLabel };
  } catch {
    return null;
  }
}

export function sourceListLabelsForUrls(urls) {
  const entries = [...new Set(urls)].map((url) => ({ url, identity: sourceListIdentity(url) }));
  const slugCounts = new Map();
  const ownerCounts = new Map();
  for (const { identity } of entries) {
    if (!identity) continue;
    slugCounts.set(identity.key, (slugCounts.get(identity.key) || 0) + 1);
    const ownerKey = `${identity.key}\u0000${identity.username.toLocaleLowerCase()}`;
    ownerCounts.set(ownerKey, (ownerCounts.get(ownerKey) || 0) + 1);
  }
  return new Map(entries.map(({ url, identity }) => {
    if (!identity) return [url, 'Letterboxd list'];
    const ownerKey = `${identity.key}\u0000${identity.username.toLocaleLowerCase()}`;
    const label = slugCounts.get(identity.key) > 1
      ? `${identity.label} · @${identity.username}${ownerCounts.get(ownerKey) > 1 ? ` · ${identity.slug}` : ''}`
      : identity.label;
    return [url, label];
  }));
}

export function sourceListLabelForUrl(url, urls = [url]) {
  return sourceListLabelsForUrls(urls.includes(url) ? urls : [...urls, url]).get(url) || 'Letterboxd list';
}

export function sourceListLabel(url, sources) {
  return sources.find((source) => source.url === url)?.label || `Unavailable list: ${url}`;
}
