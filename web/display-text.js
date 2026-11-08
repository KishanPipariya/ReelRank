const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemePrefix(value, maximum) {
  if (maximum <= 0) return '';
  let count = 0;
  let prefix = '';
  for (const { segment } of graphemeSegmenter.segment(value)) {
    if (count++ === maximum) break;
    prefix += segment;
  }
  return prefix;
}
