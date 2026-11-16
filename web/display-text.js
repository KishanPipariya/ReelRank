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

export function graphemeMiddleExcerpt(value, prefixCount, suffixCount) {
  const graphemes = [...graphemeSegmenter.segment(value)].map(({ segment }) => segment);
  if (graphemes.length <= prefixCount + suffixCount) return value;
  return `${graphemes.slice(0, prefixCount).join('')}…${graphemes.slice(-suffixCount).join('')}`;
}
