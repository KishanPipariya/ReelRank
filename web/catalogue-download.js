function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function catalogueCsv(films, sourceLists = []) {
  const rows = [['Rank', 'Title', 'Year', 'Watched', 'Liked in lists', 'Letterboxd URI', 'List URLs']];
  films.forEach((film, index) => {
    const listUrls = Array.isArray(film._sourceListUrls)
      ? film._sourceListUrls
      : Array.isArray(film.list_ids)
        ? film.list_ids.map((id) => sourceLists[id]).filter((url) => typeof url === 'string')
        : Array.isArray(film.lists) ? film.lists : [];
    rows.push([
      index + 1,
      film.letterboxd_title || film.title,
      film.letterboxd_year || film.year,
      film.watched ? 'yes' : 'no',
      Number(film.liked_in) || 0,
      film.letterboxd_url,
      listUrls.join(' '),
    ]);
  });
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadCatalogueCsv(films, sourceLists, filename = 'reelrank-catalogue.csv') {
  const blob = new Blob([`\uFEFF${catalogueCsv(films, sourceLists)}`], { type: 'text/csv;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
