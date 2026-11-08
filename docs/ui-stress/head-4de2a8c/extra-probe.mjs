import { chromium } from '../../../node_modules/playwright-core/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { validateSnapshot } from '../../../web/snapshot.js';
const root='/tmp/reelrank-head-4de2a8c';const base=JSON.parse(await readFile(new URL('../../../tests/fixtures/browser-snapshot.json',import.meta.url),'utf8'));
const token=(text,length)=>text.repeat(Math.ceil(length/text.length)).slice(0,length);
const query='InternationalCinemaPreservationAndRestorationProgramme2026OriginalLanguageRestoredUncutVersionWithEnglishSubtitlesAndCommentaryTrack.mov';
const films=[
 {...structuredClone(base.films[0]),title:token('ArchiveRestorationReference',1024),letterboxd_title:token('ArchiveRestorationReference',1024),year:'2026',original_title:'',original_language:'en',letterboxd_url:'https://letterboxd.com/film/schema-title-boundary/',poster_url:'',overview:`Archive export reference: ${query}. A schema-boundary audit of an unbroken title.`},
 {...structuredClone(base.films[0]),title:'Original title and credit boundary',letterboxd_title:'Original title and credit boundary',year:'2025',original_title:token('OriginalArchiveReference',1024),original_language:'ja',directors:[token('ArchiveCreditReference',512)],letterboxd_url:'https://letterboxd.com/film/schema-credit-boundary/',poster_url:'',overview:'A schema-boundary audit of original title and credits.'},
 {...structuredClone(base.films[0]),title:'Synopsis and year boundary',letterboxd_title:'Synopsis and year boundary',year:token('2026RestorationNotes',64),original_title:'',original_language:'en',letterboxd_url:'https://letterboxd.com/film/schema-synopsis-boundary/',poster_url:'',overview:token('ArchiveSynopsisReference',20000)},
];
const snapshot={...base,films,film_count:3,displayed_film_count:3,unwatched_count:films.filter(f=>!f.watched).length,displayed_unwatched_count:films.filter(f=>!f.watched).length,tmdb_match_count:0};validateSnapshot(snapshot);await writeFile(`${root}/extra-snapshot.json`,JSON.stringify(snapshot,null,2));const results=[];const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:696,height:1000},reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await context.route('**/data/local/snapshot.json',r=>r.fulfill({status:404}));await context.route('**/site-config.json',r=>r.fulfill({json:{letterboxd_username:snapshot.username}}));await context.route('**/data/snapshot.json',r=>r.fulfill({json:snapshot}));await context.route('https://image.tmdb.org/**',r=>r.abort());await context.addInitScript(()=>{window.print=()=>window.auditPrintRequested=true;});await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});await page.locator('#site-shell:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('#matching-films-count').textContent.startsWith('Showing'));
 // Compare the same schema-valid title in screen details before preparing print.
 await page.locator('.film-detail-trigger').filter({hasText:'Film details'}).first().count();
 await page.locator('.featured-film .film-detail-trigger').click();
 results.push({case:'screen-title',geometry:await page.locator('.film-detail-copy h2').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,width:e.getBoundingClientRect().width}))});await page.locator('#film-detail-close').click();await page.waitForFunction(()=>!new URLSearchParams(location.search).has('film'));
 await page.locator('#catalogue-tools>summary').click();await page.locator('#share-output>summary').click();
 for(const format of ['compact','reader']){
  await page.locator('#print-format-select').selectOption(format);await page.locator('#print-programme-button').click();await page.waitForFunction(()=>window.auditPrintRequested);await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
  results.push({case:'print-fields',format,rows:await page.locator('.print-film-entry').evaluateAll(rows=>rows.map(e=>{const d=e.querySelector('.print-film-details');const t=d.querySelector('h3');const c=d.querySelector('.print-film-credits');const s=e.querySelector('.print-film-score');const overview=e.querySelector('.print-film-synopsis');return{title:t.textContent.slice(0,50),row:e.getBoundingClientRect().toJSON(),detailsClient:d.clientWidth,detailsScroll:d.scrollWidth,titleRight:t.getBoundingClientRect().right,creditsRight:c.getBoundingClientRect().right,score:s.getBoundingClientRect().toJSON(),overview:overview?{client:overview.clientWidth,scroll:overview.scrollWidth}:null};}))});
  await page.locator('.print-film-entry').filter({hasText:'ArchiveRestorationReference'}).screenshot({path:`${root}/print-title-${format}.png`,animations:'disabled'});
  await page.locator('.print-film-entry').filter({hasText:'Original title and credit boundary'}).screenshot({path:`${root}/print-credit-${format}.png`,animations:'disabled'});
  if(format==='reader')await page.locator('.print-film-entry').filter({hasText:'Synopsis and year boundary'}).screenshot({path:`${root}/print-synopsis-${format}.png`,animations:'disabled'});
  await page.emulateMedia({media:'screen'});
 }
 // A long unbroken query is valid at the URL/input boundary and matches the title above.
 await page.locator('#search-input').fill(query);await page.waitForFunction(()=>document.querySelector('#matching-films-count').textContent==='Showing 1 of 1 film');
 for(const format of ['compact','reader']){await page.locator('#print-format-select').selectOption(format);await page.locator('#print-programme-button').click();await page.emulateMedia({media:'print'});results.push({case:'print-query',format,geometry:await page.locator('#print-programme-context').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,text:e.textContent}))});await page.locator('.print-programme-header').screenshot({path:`${root}/print-query-${format}.png`,animations:'disabled'});await page.emulateMedia({media:'screen'});}
 results.push({errors});await context.close();
}finally{await writeFile(`${root}/extra-results.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(JSON.stringify(results,null,2));
