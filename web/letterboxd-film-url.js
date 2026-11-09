export function canonicalLetterboxdFilmUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['letterboxd.com', 'www.letterboxd.com'].includes(url.hostname)
      || url.port || url.username || url.password || !/^\/film\/[^/]+\/?$/.test(url.pathname)) return '';
    return `https://letterboxd.com${url.pathname.replace(/\/?$/, '/')}`;
  } catch {
    return '';
  }
}
