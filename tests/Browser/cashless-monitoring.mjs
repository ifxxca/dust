import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

const require=createRequire(path.resolve('workers/jne-report/package.json'));
const {chromium}=require('playwright');
const output=path.resolve(process.env.CASHLESS_MONITORING_QA_OUTPUT);
const database=path.resolve(process.env.CASHLESS_MONITORING_QA_DATABASE);
assert(database.endsWith('.sqlite') && database.startsWith(output+path.sep));
const base='http://127.0.0.1:8047';
const server=spawn('php',['-d','extension=pdo_sqlite','-d','extension=sqlite3','-S','127.0.0.1:8047',path.resolve('vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')],{cwd:path.resolve('public'),windowsHide:true,stdio:'ignore',env:{...process.env,APP_ENV:'testing',APP_URL:base,DB_CONNECTION:'sqlite',DB_DATABASE:database,DB_URL:'',SESSION_DRIVER:'file',SESSION_COOKIE:'cashless_monitoring_qa',SESSION_DOMAIN:'127.0.0.1',SESSION_SECURE_COOKIE:'false',CACHE_STORE:'array',MAIL_MAILER:'array',PICKUP_AUTOMATION_ENABLED:'false',PICKUP_AWB_SEND_ENABLED:'false',CONTROL_CENTER_ENABLED:'false'}});
const browser=await chromium.launch({headless:true});
const checks=[];const errors=[];
try {
 let listening=false;
 for(let attempt=0;attempt<50;attempt++) {
  try {if((await fetch(base+'/login')).ok){listening=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert(listening,'isolated SQLite server must be available');
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(base+'/login');
 await page.locator('#email').fill('audit-admin_supervisor@example.test');
 await page.locator('#password').fill('password');
 await page.locator('button[type=submit]').click();
 await page.waitForURL(url=>!url.pathname.startsWith('/login'));
 await page.goto(base+'/monitoring-cashless');
 await page.getByRole('heading',{name:'Monitoring Cashless',exact:true}).waitFor();
 assert(await page.locator('a[href="/monitoring-cashless"]').isVisible());
 await page.getByText('Tidak ada resi cashless sesuai filter. Ubah periode scan atau pencarian.',{exact:true}).waitFor();
 checks.push('real read-only endpoint and sidebar render an accessible empty result on the isolated database');

 // Presentation matrix only. Server classification, authorization, filters and pagination are tested by CashlessMonitoringTest.
 const fixtureStates=['registered','queued','processing','approval','success','failed','attention'];
 const rows=fixtureStates.map((state,index)=>({id:index+1,awb:`TG2026111600${index+1}`,task_id:1,reference:`PCK-SIM-${index+1}`,customer:'Customer simulasi cashless',staff:'Petugas simulasi',state,source:index%2?'nuralamt':'roberto',ho_number:index>1?`HO-SIM-${index+1}`:null,attempted_awb:`TG2026111600${index+1}`,previous_ho:state==='attention'?'HO-SEBELUMNYA':null,batch_id:index?index:null,batch_status:state==='success'?'DONE':state==='failed'?'PARTIAL':state==='approval'?'APPROVING':'QUEUED',item_status:state==='success'||state==='approval'?'ACCEPTED':state==='attention'?'PREVIOUSLY_ENTERED':state==='failed'?'NOT_FOUND':'PENDING',message:state==='failed'?'Connote tidak ditemukan':state==='attention'?'Connote sudah pernah dientry':null,batch_message:null,scanned_at:'2026-11-16 05:00:00',attempted_at:'2026-11-16 05:01:00',approved_at:state==='success'?'2026-11-16 05:02:00':null}));
 let queries=0;
 await page.route('**/monitoring-cashless?**',async route=>{
  queries++;
  const response=await route.fetch();const payload=await response.json();
  const params=new URL(route.request().url()).searchParams;
  const visible=rows.filter(row=>(!params.get('state')||row.state===params.get('state'))&&(!params.get('q')||row.awb.includes(params.get('q'))));
  payload.props.monitor={updated_at:'2026-11-16T05:03:00Z',rows:{data:visible,total:visible.length,from:visible.length?1:null,to:visible.length||null,current_page:1,last_page:1}};
  await route.fulfill({response,json:payload});
 });
 await page.getByRole('button',{name:'Terapkan',exact:true}).click();
 await page.locator('table').getByText('Berhasil',{exact:true}).waitFor();
 for(const name of ['Belum diantrekan','Dalam antrean','Sedang diproses','Menunggu approval HO','Berhasil','Gagal','Sudah pernah diinput']) assert(await page.locator('table').getByText(name,{exact:true}).isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(output,'desktop.png'),fullPage:false});
 const failed=page.locator('table').getByRole('button',{name:'Lihat hasil TG20261116006',exact:true});
 await failed.click();
 await page.getByRole('heading',{name:'TG20261116006',exact:true}).waitFor();
 assert(await page.getByText('Connote tidak ditemukan',{exact:true}).isVisible());
 await page.screenshot({path:path.join(output,'failure-drawer.png'),fullPage:false});
 await page.keyboard.press('Escape');
 assert(await failed.evaluate(element=>element===document.activeElement));
 checks.push('all seven status states and failure evidence are visible; keyboard focus returns from the drawer');
 const before=queries;
 await page.getByLabel('Cari resi atau pickup',{exact:true}).pressSequentially('TG20261116005',{delay:15});
 assert.equal(queries,before);
 await page.getByRole('button',{name:'Terapkan',exact:true}).click();
 await page.waitForURL(url=>url.searchParams.get('q')==='TG20261116005');
 assert.equal(await page.locator('table tbody tr').count(),1);
 await page.getByLabel('Resi per halaman',{exact:true}).selectOption('50');
 await page.waitForURL(url=>url.searchParams.get('per_page')==='50');
 checks.push('typing does not query; explicit filter submission and per-page selection preserve URL state');
 await page.getByLabel('Cari resi atau pickup',{exact:true}).fill('');
 await page.getByRole('button',{name:'Terapkan',exact:true}).click();
 await page.waitForURL(url=>!url.searchParams.get('q'));
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const mobile=page.locator('article').filter({hasText:'TG20261116006'});
 await mobile.scrollIntoViewIfNeeded();
 await mobile.getByRole('button',{name:'Lihat hasil TG20261116006',exact:true}).click();
 await page.getByRole('heading',{name:'TG20261116006',exact:true}).waitFor();
 assert(await page.getByText('Connote tidak ditemukan',{exact:true}).isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:path.join(output,'mobile-drawer.png'),fullPage:false});
 await page.keyboard.press('Escape');
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:path.join(output,'mobile.png'),fullPage:false});
 checks.push('390px mobile cards, filters and result drawer have no page overflow');
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'browser-results.json'),JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({passed:checks.length,checks}));
} catch(error) {
 console.log(JSON.stringify({errors}));
 const page=browser.contexts().flatMap(context=>context.pages())[0];
 if(page) await page.screenshot({path:path.join(output,'failure.png'),fullPage:false});
 throw error;
} finally {await browser.close();server.kill();}
