import { chromium } from '../../../node_modules/playwright-core/index.mjs';
import { readFile,writeFile } from 'node:fs/promises';
import { validateSnapshot } from '../../../web/snapshot.js';
const root='/tmp/reelrank-working-audit';const results=[];const browser=await chromium.launch({headless:true});
try{
 for(const name of ['ascii-control','ascii-overflow','unicode-boundary']){
  const snapshot=JSON.parse(await readFile(`${root}/${name}/snapshot.json`,'utf8'));let clientResult;try{validateSnapshot(snapshot);clientResult='accepted';}catch(e){clientResult=e.message;}
  for(const width of [320,1440]){const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/data/local/snapshot.json',r=>r.fulfill({status:404}));await context.route('**/site-config.json',r=>r.fulfill({json:{letterboxd_username:snapshot.username}}));await context.route('**/data/snapshot.json',r=>r.fulfill({json:snapshot}));await context.route('https://image.tmdb.org/**',r=>r.abort());await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});if(name==='ascii-control'){await page.locator('#site-shell:not([hidden])').waitFor();}else{await page.locator('#retry-loading:not([hidden])').waitFor();}results.push({name,width,clientResult,setupVisible:await page.locator('#setup-state').isVisible(),catalogueVisible:await page.locator('#site-shell').isVisible(),setupText:await page.locator('#setup-state').textContent(),errors});if(name!=='ascii-control')await page.screenshot({path:`${root}/contract-${name}-${width}.png`,animations:'disabled'});await context.close();}
 }
}finally{await writeFile(`${root}/contract-browser.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(JSON.stringify(results,null,2));
