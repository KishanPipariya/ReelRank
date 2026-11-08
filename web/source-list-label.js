export function sourceListLabel(url, sources) {
  return sources.find((source) => source.url === url)?.label || `Unavailable list: ${url}`;
}
