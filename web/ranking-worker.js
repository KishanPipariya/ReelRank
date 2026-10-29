import { loadFullRankingDirect } from './ranking-csv.js';

self.addEventListener('message', async (event) => {
  try {
    const { snapshot, cache } = event.data;
    const films = await loadFullRankingDirect(snapshot, cache);
    self.postMessage({ films });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Full ranking could not be loaded' });
  }
});
