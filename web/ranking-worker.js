import { loadFullRankingDirect } from './ranking-csv.js';
import { loadCatalogueIndexDirect } from './catalogue-index.js';

self.addEventListener('message', async (event) => {
  try {
    const { snapshot, cache, kind } = event.data;
    if (kind === 'catalogue-index') {
      const index = await loadCatalogueIndexDirect(snapshot, cache);
      self.postMessage({ index });
    } else {
      const films = await loadFullRankingDirect(snapshot, cache);
      self.postMessage({ films });
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Catalogue data could not be loaded' });
  }
});
