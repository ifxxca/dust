import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Presentation,PresentationFile} from '@oai/artifact-tool';
const ROOT='S:/2026/dust/presentation';
const SKILL='C:/Users/copol/.codex/plugins/cache/openai-primary-runtime/presentations/26.1013.11914/skills/presentations';
const C={blue:'#17336F',red:'#DF2335',ink:'#15243B',muted:'#5D6C82',line:'#D6DFEB',pale:'#EEF3FA',white:'#FFFFFF',green:'#087965',amber:'#965F12',warm:'#FFF5E6'};
const P=Presentation.create({slideSize:{width:1600,height:900}});
const manifest=JSON.parse(await fs.readFile(ROOT+'/assets/asset-manifest.json','utf8'));
const sourceNotes=[];
function shape(s,name,x,y,w,h,fill='none',stroke='none',radius=0){return s.shapes.add({name,geometry:radius?'roundRect':'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:stroke,width:stroke==='none'?0:1.3},...(radius?{borderRadius:radius}:{})});}
function txt(s,text,x,y,w,h,size=28,color=C.ink,bold=false,align='left'){
 const o=shape(s,'Text '+text.slice(0,38),x,y,w,h);o.text=text;o.text.style={fontSize:size,typeface:'Arial',bold,color,alignment:align,verticalAlignment:'top',insets:0,autoFit:'none',wrap:'square'};return o;
}
function rule(s,x,y,w,color=C.line){return shape(s,'Rule',x,y,w,2,color);}
function notes(s,text,sources){s.speakerNotes.text=text+'\n\nSumber internal (ditinjau 15 Oktober 2026):\n'+sources.map(v=>'- '+v).join('\n');sourceNotes.push({slide:P.slides.items.length,title:s._title,sources,notes:text});}
function slide(title,sub='',footer='Retail Operations Platform   /   Internal',bg=C.white){const s=P.slides.add();s._title=title;s.background.fill=bg;
 txt(s,String(P.slides.items.length).padStart(2,'0'),1460,825,60,28,19,C.muted,false,'right');
 txt(s,footer,80,825,1280,28,18,C.muted);rule(s,80,800,1440);shape(s,'Accent',80,55,64,5,C.red);
 txt(s,title,80,87,1440,90,56,C.blue,true);if(sub)txt(s,sub,80,180,1420,62,26,C.muted);return s;}
function label(s,text,x,y,w=800,color=C.muted,size=20){txt(s,text,x,y,w,45,size,color);}
async function pic(s,name,x,y,w,h,device=false){const m=manifest.find(v=>v.name===name);const iw=m.width,ih=m.height;const scale=Math.min(w/iw,h/ih);const pw=iw*scale,ph=ih*scale;const px=x+(w-pw)/2,py=y+(h-ph)/2;
 if(device)shape(s,'Frame Android',px-9,py-9,pw+18,ph+18,'#15243B','none',22);
 const b=await fs.readFile(ROOT+'/assets/'+name+'.png');s.images.add({blob:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),contentType:'image/png',alt:'Tangkapan aplikasi pengujian '+name+'; data sintetis',fit:'contain',position:{left:px,top:py,width:pw,height:ph}});return {x:px,y:py,w:pw,h:ph};}
function node(s,text,x,y,w,h,fill=C.pale,color=C.blue,stroke=C.line,size=27){const o=shape(s,'Diagram '+text,x,y,w,h,fill,stroke,8);o.text=text;o.text.style={fontSize:size,typeface:'Arial',bold:true,color,alignment:'center',verticalAlignment:'middle',insets:16,autoFit:'none'};return o;}
function connect(s,a,b,side='right',to='left',dashed=false){return s.shapes.connect(a,b,{kind:'straight',fromSide:side,toSide:to,line:{fill:dashed?C.amber:C.blue,width:2.3,style:dashed?'dashed':'solid'},tail:{type:'triangle',width:'med',length:'med'}});}
function row(s,n,title,body,y,{x=80,w=825,color=C.blue}={}){txt(s,String(n).padStart(2,'0'),x,y,65,48,32,color,true);txt(s,title,x+86,y,w-86,48,31,C.ink,true);txt(s,body,x+86,y+52,w-95,85,26,C.muted);}
function table(s,values,x,y,w,h,widths,colors={}){const t=s.tables.add({rows:values.length,columns:values[0].length,left:x,top:y,width:w,height:h,columnWidths:widths,values});
 t.borders.assign({fill:C.white,width:1,style:'solid'});for(let r=0;r<values.length;r++){t.rows[r].height=h/values.length;for(let c=0;c<values[0].length;c++){const cell=t.getCell(r,c);cell.fill=r===0?C.blue:(r%2?C.pale:C.white);cell.text.style={fontSize:r===0?24:25,typeface:'Arial',bold:r===0,color:r===0?C.white:(colors[c]||C.ink)};cell.text.insets={top:14,bottom:10,left:18,right:16};}}
 return t;}
// 01
{
 const s=P.slides.add();s._title='Retail Operations Platform';s.background.fill=C.white;
 shape(s,'Accent',80,95,80,6,C.red);txt(s,'RETAIL OPERATIONS',80,135,850,45,24,C.blue,true);
 txt(s,'Retail Operations\nPlatform',80,250,990,210,83,C.blue,true);
 txt(s,'Pickup Management untuk\noperasional cabang dan petugas lapangan',84,490,920,110,36,C.ink);
 txt(s,'Paparan produk internal\n15 Oktober 2026',84,690,800,70,25,C.muted);
 await pic(s,'mobile-detail',1130,105,345,675,true);
 label(s,'Aplikasi aktual pada emulator; data uji sintetis',1050,810,490,C.muted,18);
 notes(s,'Memperkenalkan platform operasional retail dengan fokus kemampuan Pickup Management yang telah tersedia. Screenshot berasal dari APK fixture native, bukan UI konsep. Tampilan merupakan snapshot pengujian terdahulu. Platform belum memperoleh persetujuan pilot atau rilis produksi. Tidak memakai logo JNE terpisah karena otorisasi aset merek tidak dapat dipastikan.', ['docs/PRD_MOBILE_V1.md §1–2','docs/mobile/IMPLEMENTATION_PLAN.md §16–23','storage/mobile-mockup-detail.png']);
}
// 02
{
 const s=slide('Tantangan operasional yang ingin ditangani','Kebutuhan proses berdasarkan PRD. Besaran masalah belum diukur.');
 txt(s,'TITIK KOORDINASI',80,275,650,35,22,C.red,true);txt(s,'KEBUTUHAN OPERASIONAL',790,275,700,35,22,C.blue,true);
 const rows=[['Pembagian tugas','Penanggung jawab dan jadwal yang jelas'],['Pekerjaan lapangan','Input hasil kunjungan melalui perangkat seluler'],['Serah terima paket','Perbandingan jumlah dan pencatatan selisih'],['Penelusuran aktivitas','Riwayat yang menghubungkan tugas, bukti, dan penerimaan']];
 rows.forEach((r,i)=>{const y=342+i*103;txt(s,r[0],80,y,615,55,33,C.ink,true);txt(s,r[1],790,y,700,70,28,C.muted);rule(s,80,y+83,1440);});
 notes(s,'Slide ini merangkum kebutuhan yang melatarbelakangi produk, bukan hasil survei atau pengukuran masalah di cabang. Tidak ada klaim bahwa seluruh cabang memakai proses manual, mengalami tingkat kehilangan tertentu, atau memiliki baseline SLA tertentu.', ['docs/PRD_MOBILE_V1.md §1.1–1.3','docs/prd.md bagian tujuan dan workflow']);
}
// 03
{
 const s=slide('Visi satu platform operasional retail','Satu sumber data operasional untuk pengguna web dan petugas Android');
 const a=node(s,'CS / Admin',80,280,310,90);const b=node(s,'Pickup Staff',80,435,310,90);const c=node(s,'Retail / Supervisor',80,590,310,90);
 const core=node(s,'Retail Operations\nPlatform',540,355,490,210,C.blue,C.white,'none',40);[a,b,c].forEach(v=>connect(s,v,core));
 txt(s,'Fokus saat ini',1140,287,360,45,25,C.red,true);txt(s,'Pickup\nManagement',1140,340,380,120,44,C.blue,true);
 txt(s,'Modul retail berikutnya\nmemakai fondasi data\ndan hak akses yang sama.',1140,505,375,150,28,C.muted);
 connect(s,core,node(s,'Data dan aturan bisnis bersama',540,635,490,90,C.white,C.blue,C.line,27),'bottom','top');
 notes(s,'Satu backend Laravel melayani web Inertia dan mobile React SPA di Capacitor. Visi pengembangan modul tambahan adalah arah produk, bukan komitmen implementasi semua modul. Pembagian tanggung jawab mengikuti peran yang tersedia; verifikasi tidak eksklusif Retail karena kebijakan existing dan perluasan mobile yang telah disetujui.', ['routes/web.php','routes/api.php','resources/js/pages/operations.tsx','resources/mobile/src/app.tsx','docs/mobile/TECHNICAL_DESIGN.md §3 dan addendum']);
}
// 04
{
 const s=slide('Cakupan saat ini: Pickup Management','Kemampuan tersedia di kode dan didukung bukti pengujian repositori');
 table(s,[['Area','Kemampuan saat ini','Kanal'],['Persiapan','Master pelanggan dan jadwal reguler','Web'],['Penugasan','Pickup on-demand, assignment tunggal / massal','Web'],['Lapangan','Tugas, takeover, pickup manual, hasil kunjungan','Web + Android'],['Bukti pickup','Jumlah per kategori, foto, tanda tangan, finalisasi','Web + Android'],['Serah terima','Handover, verifikasi, penutupan, riwayat','Web + Android']],80,270,1440,445,[260,850,330]);
 txt(s,'Pelaporan lanjutan dan integrasi eksternal tetap berada di roadmap.',80,744,1400,38,26,C.muted);
 notes(s,'Master customer dikelola CS/Admin melalui web. Pickup manual oleh Pickup Staff hanya untuk customer existing dan ditugaskan kepada dirinya sendiri. Bulk assignment hanya CS/Admin web untuk task eligible, bukan bulk takeover atau mobile assignment. Jadwal reguler tersedia di web. Kesiapan operasional semua kemampuan dibahas pada slide 13.', ['routes/web.php','routes/api.php','docs/mobile/IMPLEMENTATION_PLAN.md §17,19,21,22','app/Actions/Pickup/AssignPickupTasks.php','resources/mobile/src/manual-pickup.tsx']);
}
// 05
{
 const s=slide('Alur pickup hingga serah terima','Tugas yang sama menghubungkan persiapan, pekerjaan lapangan, dan penerimaan');
 const names=['Buat tugas','Tugaskan\npetugas','Kunjungi\npelanggan','Finalisasi\nbukti pickup','Handover &\nverifikasi'];
 const desc=['CS / Admin\natau pickup manual','CS / Admin\natau penugasan diri','Pickup Staff\nmencatat hasil','Jumlah dan bukti\nmenjadi POP final','Jumlah diterima\ndan sesi ditutup'];
 const ns=names.map((v,i)=>node(s,v,80+i*295,310,260,110,i===4?C.blue:C.pale,i===4?C.white:C.blue));ns.slice(0,-1).forEach((a,i)=>connect(s,a,ns[i+1]));
 desc.forEach((v,i)=>{if(i!==2)txt(s,v,80+i*295,445,260,95,25,C.muted,false,'center');});
 const no=node(s,'Tanpa Paket + alasan wajib',590,615,420,75,C.warm,C.amber,'none',26);connect(s,ns[2],no,'bottom','top');
 txt(s,'Tugas selesai tanpa POP dan tanpa handover.\nKunjungan berikutnya memakai tugas baru yang saling terkait.',650,711,760,65,25,C.muted);
 notes(s,'Diagram menyederhanakan alur operasional, bukan state machine lengkap. Task SCHEDULED menjadi ASSIGNED saat assignment. Start dan COLLECTED belum menjadikan task PICKED_UP. Finalisasi POP yang sukses menjadikan task PICKED_UP. Handover adalah lifecycle session tersendiri dan tidak mengganti status task. NO_PACKAGES terminal mengikuti addendum terbaru, menggantikan aturan retry pada baseline lama.', ['app/Actions/Pickup/RecordPickupVisit.php','app/Actions/Pickup/FinalizePickup.php','app/Actions/Pickup/CreatePickupTask.php','app/Actions/Handover/CreateSession.php','docs/PRD_MOBILE_V1.md §4','docs/mobile/IMPLEMENTATION_PLAN.md §17,19']);
}
// 06
{
 const s=slide('Web management untuk koordinasi cabang','CS dan Admin menyiapkan pekerjaan serta memantau tindak lanjut');
 row(s,1,'Pembuatan tugas','Pilih pelanggan, alamat, dan waktu pickup. Jadwal reguler mendukung pekerjaan berulang.',285,{w:800});
 row(s,2,'Penugasan petugas','Assignment satu per satu atau massal untuk tugas yang memenuhi syarat.',435,{w:800});
 row(s,3,'Pemantauan pekerjaan','Cari dan filter tugas, buka detail, lalu telusuri bukti dan handover.',585,{w:800});
 await pic(s,'web-create',1000,255,440,505);
 label(s,'Tangkapan aktual web QA; formulir tanpa data pelanggan',920,770,590,C.muted,18);
 notes(s,'Screenshot formulir berasal dari pengujian layout web terdahulu; tidak menunjukkan UI baru bulk assignment atau master customer yang diperluas. Kedua kemampuan terbaru terkonfirmasi di kode, routes, tests dan catatan §21–22, tetapi manual browser UAT belum dilakukan. Bulk assignment memeriksa seluruh batch dan membatalkan transaksi jika ada konflik. Jangan menafsirkan fitur sebagai bulk reassignment.', ['resources/js/components/create-pickup.tsx','resources/js/components/bulk-pickup-assignment.tsx','resources/js/components/pickup-operational-list.tsx','routes/web.php','docs/mobile/IMPLEMENTATION_PLAN.md §21–22','storage/app/ui-qa-fluid-operations-create-1920.png']);
}
// 07
{
 const s=slide('Android sebagai ruang kerja petugas','Aplikasi React + Capacitor yang terhubung ke backend operasional yang sama');
 txt(s,'Pekerjaan harian\ndalam satu aplikasi',80,285,650,135,46,C.ink,true);
 txt(s,'Beranda memberi akses ke tugas.\nTugas Saya, Tersedia, dan Riwayat\nmembantu petugas menemukan pekerjaan.',80,455,650,145,29,C.muted);
 txt(s,'Notifikasi assignment melalui FCM tersedia.\nPengiriman nyata pada APK terbaru\nmasih perlu UAT perangkat.',80,645,650,105,26,C.amber);
 await pic(s,'mobile-home',830,265,295,490,true);await pic(s,'mobile-tasks',1190,265,295,490,true);
 label(s,'Tangkapan APK pengujian; data sintetis. Menu “Segera Hadir” adalah rencana.',790,770,750,C.muted,18);
 notes(s,'Screenshot asli native fixture APK, walaupun nama berkas memakai kata mockup. Implementation Plan §16 secara eksplisit mengidentifikasinya sebagai actual native screenshots. Menu Cashless, Fleet, Absensi dan Lainnya pada gambar belum menjadi modul operasional. Notifikasi mobile bukan persisted server inbox. FCM assignment, registrasi perangkat, worker, guard penerima dan deep link tersedia, tetapi mocked transport/synthetic taps tidak membuktikan delivery nyata pada APK terbaru.', ['storage/mobile-mockup-home.png','storage/mobile-mockup-tasks.png','docs/mobile/IMPLEMENTATION_PLAN.md §16,19,23','resources/mobile/src/app.tsx','resources/mobile/src/push.ts','app/Jobs/SendPickupAssignmentPush.php']);
}
// 08
{
 const s=slide('Eksekusi pickup dengan langkah terpandu','Petugas melihat tindakan yang relevan dengan status dan kepemilikan tugas');
 row(s,1,'Mulai kunjungan','Buka detail pelanggan dan konfirmasikan pekerjaan.',280,{w:880});
 row(s,2,'Catat hasil kunjungan','Paket diterima: lanjutkan ke Proof of Pickup.',425,{w:880});
 row(s,3,'Tanpa paket','Alasan wajib. Tugas selesai tanpa POP dan keluar dari daftar aktif.',570,{w:880,color:C.amber});
 await pic(s,'mobile-no-packages',1090,260,320,485,true);
 label(s,'Tangkapan aktual emulator; data sintetis',1000,768,500,C.muted,18);
 notes(s,'NO_PACKAGES terminal telah diterapkan pada web dan mobile sesuai persetujuan owner 14 Oktober 2026. Kunjungan berikutnya membuat task baru yang merujuk task asal, dengan customer sama dan jadwal setelah task asal. Staff tidak memperoleh hak cancel. Untuk COLLECTED, task tetap ASSIGNED sampai POP difinalisasi. Takeover hanya untuk task yang memenuhi syarat sebelum eksekusi mulai.', ['app/Actions/Pickup/RecordPickupVisit.php','app/Actions/Pickup/CreatePickupTask.php','resources/mobile/src/execution-panel.tsx','resources/mobile/src/manual-pickup.tsx','docs/mobile/IMPLEMENTATION_PLAN.md §17','storage/mobile-no-packages-complete.png']);
}
// 09
{
 const s=slide('Proof of Pickup: jumlah dan bukti penjemputan','Finalisasi menyimpan hasil pickup yang dapat ditelusuri');
 txt(s,'Tiga kategori jumlah',80,280,700,45,34,C.ink,true);
 txt(s,'Manual Hybrid Non-Cashless\nCashless Hybrid\nCSS / Orion',80,345,680,140,29,C.muted);
 txt(s,'Tanda tangan wajib\nFoto opsional, maksimal empat',80,535,690,95,32,C.blue,true);
 txt(s,'Petugas meninjau ringkasan sebelum finalisasi.\nDraft lokal memerlukan internet untuk dikirim.',80,680,690,85,27,C.muted);
 await pic(s,'mobile-quantities',840,270,300,480,true);await pic(s,'mobile-review',1190,270,300,480,true);
 label(s,'Tangkapan aktual emulator; seluruh jumlah merupakan data uji',800,770,750,C.muted,18);
 notes(s,'FinalizePickupRequest memerlukan jumlah integer non-negatif dengan total positif dan signature PNG berisi ink. Foto opsional maksimal 4, 5 MiB per foto; signature maksimal 1 MiB. Screenshot bukan bukti operasional customer nyata. Label Cashless Hybrid pada POP hanya kategori jumlah dan bukan integrasi HO JNE Hybrid. Draft terenkripsi akun/lingkungan tersimpan lokal; tidak ada transaksi bisnis offline atau auto-submit. POP final tidak otomatis berarti receipt terkirim. Pencatatan receipt dan provider delivery harus dilihat terpisah.', ['app/Http/Requests/FinalizePickupRequest.php','app/Actions/Pickup/FinalizePickup.php','resources/mobile/src/proof-panel.tsx','docs/PRD_MOBILE_V1.md MOB-06, MOB-09','storage/mobile-mockup-pop-quantities.png','storage/mobile-mockup-pop-review.png']);
}
// 10
{
 const s=slide('Handover menghubungkan lapangan dan retail','Jumlah pickup menjadi acuan pemeriksaan paket yang benar-benar diterima');
 const a=node(s,'Sesi DRAFT\npilih pickup eligible',80,280,660,85,C.pale,C.blue,C.line,27);
 const b=node(s,'Verifikasi tiga kategori\ncatat selisih bila ada',80,435,660,85,C.pale,C.blue,C.line,27);
 const c=node(s,'Sesi CLOSED\nsetelah semua item diperiksa',80,590,660,85,C.blue,C.white,'none',27);
 connect(s,a,b,'bottom','top');connect(s,b,c,'bottom','top');
 txt(s,'Sesi ditutup tetap dapat memiliki selisih terbuka.',80,715,690,65,27,C.amber,true);
 await pic(s,'mobile-verification',860,270,290,480,true);await pic(s,'mobile-closed',1190,270,290,480,true);
 label(s,'Tangkapan aktual emulator; sesi dan pelanggan sintetis',830,770,710,C.muted,18);
 notes(s,'Alur bisnis menghubungkan penyerahan Pickup Staff dan penerimaan Retail. Hak verifikasi/close backend tidak Retail-only: canExecutePickup() juga mencakup Pickup Staff dan Admin. Perluasan verify/close mobile telah disetujui owner dan tersedia pada API/UI, sesuai §19. Perubahan anggota hanya DRAFT, seluruh item harus diperiksa, perubahan POP yang memerlukan review menghalangi close, selisih memerlukan catatan. CLOSED tidak menyelesaikan discrepancy. Koreksi/reopen adalah batas kewenangan tersendiri, bukan fitur mobile.', ['routes/api.php','app/Actions/Handover/VerifyItem.php','app/Actions/Handover/CloseSession.php','resources/mobile/src/handover-panel.tsx','docs/mobile/IMPLEMENTATION_PLAN.md §19','storage/mobile-handover-verification.png','storage/mobile-handover-closed.png']);
}
// 11
{
 const s=slide('Visibilitas operasional dan jejak aktivitas','Data tugas terhubung dengan petugas, bukti pickup, dan hasil penerimaan');
 const flow=['Referensi tugas','Petugas & waktu','POP final','Handover','Hasil verifikasi'];
 const ns=flow.map((v,i)=>node(s,v,80+i*295,280,260,85,C.pale,C.blue,C.line,25));ns.slice(0,-1).forEach((v,i)=>connect(s,v,ns[i+1]));
 txt(s,'Pemantauan harian',80,440,670,50,36,C.ink,true);
 txt(s,'Dashboard ringkasan, daftar tugas, pencarian,\nfilter status, dan pekerjaan yang perlu tindakan.',80,510,675,110,29,C.muted);
 txt(s,'Audit dan pemeriksaan',850,440,670,50,36,C.ink,true);
 txt(s,'Riwayat perubahan membantu menelusuri\nsiapa melakukan apa, kapan, dan pada tugas mana.',850,510,670,110,29,C.muted);
 rule(s,80,675,1440);txt(s,'Monitoring tersedia saat ini. Analitik kinerja dan pelaporan lanjutan masih direncanakan.',80,710,1430,65,27,C.blue,true);
 notes(s,'OperationalDashboardController menyediakan ringkasan dan tren tujuh hari dari status saat ini per tanggal jadwal, bukan snapshot historis kinerja. Tidak menyebutnya BI atau performance analytics lengkap. Events pada task dan handover menyimpan actor/action/version/timestamp. Private evidence diotorisasi. Snapshot customer pada task dan POP mendukung keterlacakan ketika master customer berubah. Tidak ada GPS live tracking atau optimasi rute dalam mobile V1.', ['app/Http/Controllers/OperationalDashboardController.php','app/Actions/Pickup/RecordPickupVisit.php','app/Actions/Pickup/FinalizePickup.php','app/Actions/Handover/VerifyItem.php','resources/js/pages/discrepancies.tsx','docs/PRD_MOBILE_V1.md §2.2']);
}
// 12
{
 const s=slide('Arsitektur sistem yang terintegrasi','Komponen operasional saat ini dan batas integrasi mendatang');
 const web=node(s,'Retail Web\nReact + Inertia',80,280,325,95);const mob=node(s,'Staff Android\nReact + Capacitor',475,280,325,95);
 const back=node(s,'Laravel Backend\naturan bisnis dan hak akses',200,460,480,105,C.blue,C.white,'none',29);
 connect(s,web,back,'bottom','top');connect(s,mob,back,'bottom','top');
 const db=node(s,'Database + modul bisnis\npickup, POP, handover, audit',200,650,480,100,C.pale,C.blue,C.line,27);connect(s,back,db,'bottom','top');
 const fcm=node(s,'Firebase Cloud Messaging\nnotifikasi assignment',1040,310,460,100,C.pale,C.blue,C.line,27);connect(s,back,fcm);connect(s,fcm,mob,'left','right');
 label(s,'Tersedia; delivery nyata APK terbaru belum UAT',1010,435,510,C.amber,21);
 const future=node(s,'Rencana integrasi\nJNE Hybrid / ERP / kanal pelanggan',950,635,550,115,C.warm,C.amber,C.amber,27);connect(s,db,future,'right','left',true);
 notes(s,'Diagram konseptual arsitektur yang disederhanakan untuk manajemen. Diagram bukan urutan transaksi literal database-ke-service. Laravel 13.35.0 dan Inertia PHP 3.5.1 dikonfirmasi melalui composer show --direct. React dan Capacitor tersedia di package.json, mobile bootstrap, Android project. FCM transport/worker/registration terimplementasi, delivery nyata pada build terbaru belum diverifikasi. Laravel mengirim notifikasi melalui antrean lalu FCM ke Android; connector menyederhanakan routing. Integrasi Hybrid/ERP/Customer Portal belum production. Tidak mengekspos URL internal, credential, DB connection, token atau Firebase project identifier.', ['composer show --direct, 15 Oktober 2026','package.json','routes/api.php','resources/mobile/src/main.tsx','app/Jobs/SendPickupAssignmentPush.php','docs/mobile/TECHNICAL_DESIGN.md','docs/mobile/IMPLEMENTATION_PLAN.md §23','Roadmap dari brief pengguna']);
}
// 13
{
 const s=slide('Status implementasi dan kesiapan operasional','Verifikasi teknis tidak menggantikan UAT dan persetujuan rilis');
 table(s,[['Kategori','Area','Batas bukti saat ini'],['Terverifikasi teknis','Alur pickup, POP, handover Android','Kode, uji otomatis, dan skenario emulator tercatat'],['Implementasi tersedia','Customer web, assignment massal, tes push Admin','Uji otomatis tercatat. UAT browser aktual belum selesai'],['Implementasi tersedia','FCM assignment dan tes notifikasi','Transport diuji dengan mock. Delivery nyata belum UAT'],['Rencana / konsep','Analitik, cashless HO, AWB, portal, fleet','Belum menjadi integrasi produksi']],80,260,1440,360,[300,490,650]);
 txt(s,'BELUM SIAP PILOT',80,655,550,55,35,C.red,true);txt(s,'UAT perangkat fisik, signing, HTTPS, distribusi,\ndan penanggung jawab dukungan masih terbuka.',650,648,855,90,28,C.ink);
 label(s,'Aturan terbaru menggantikan baseline lama: Tanpa Paket menutup tugas; mobile mendukung verifikasi dan penutupan.',80,750,1440,C.muted,19);
 notes(s,'Klasifikasi terverifikasi teknis berarti implementasi terkonfirmasi dari inspeksi kode dan bukti pengujian yang sudah tercatat di repository. Tidak ada suite dijalankan ulang pada tugas presentasi ini karena tidak menjalankan migrasi atau transaksi bisnis. Latest §23 mencatat full Laravel 299 PASS/5 SKIP, mobile client44 PASS dan assembleDebug sukses. Angka ini tidak ditampilkan sebagai hasil audit baru. APK latest tercatat1.0.9/code10, masih development. Native emulator evidence sebelumnya tidak otomatis menjadi bukti physical-device atau real FCM delivery pada build latest. Baseline Technical Design §1–2/§2.1 masih menyebut Sanctum/native belum ada, NO_PACKAGES tetap assigned/retry dan mobile tidak verify/close; composer/routes/code dan addendum §17/§19 menunjukkan kondisi terbaru. PRD MOB-08 juga memuat frasa close tidak memerlukan review POP, sedangkan CloseSession memblokir needsReview(); kode menjadi sumber perilaku. Logo JNE kini ada di resources/mobile/src/jne-logo.svg meski §16 menyatakan tidak tersedia. Provenance otorisasi logo tidak dikonfirmasi, maka tidak dipakai terpisah. Fitur roadmap tetap konsep. M5 dan pilot/release gates terbuka.', ['docs/mobile/IMPLEMENTATION_PLAN.md §17–23','docs/mobile/TECHNICAL_DESIGN.md §1–2, §16, §18','docs/PRD_MOBILE_V1.md MOB-08','app/Actions/Handover/CloseSession.php','routes/api.php','resources/mobile/src/handover-panel.tsx','composer show --direct']);
}
// 14
{
 const s=slide('Manfaat bisnis yang diharapkan','Hipotesis manfaat yang perlu dibuktikan melalui UAT dan pilot');
 const pairs=[['Koordinasi tugas lebih jelas','Penanggung jawab, jadwal, dan status berada pada satu alur.'],['Pencatatan lapangan lebih konsisten','Petugas mengikuti langkah dan validasi yang sama.'],['Pemeriksaan serah terima lebih terarah','Jumlah per kategori dan catatan selisih menjadi acuan.'],['Evaluasi operasional lebih mudah','Data tugas, bukti, dan penerimaan tersedia untuk ditelusuri.']];
 pairs.forEach((p,i)=>{const y=285+i*116;txt(s,String(i+1).padStart(2,'0'),80,y,75,60,39,C.red,true);txt(s,p[0],190,y,1310,48,33,C.blue,true);txt(s,p[1],190,y+53,1290,53,27,C.muted);});
 notes(s,'Semua manfaat pada slide merupakan expected improvements, bukan measured outcomes. Tidak ada persentase peningkatan produktivitas, penghematan, adopsi atau SLA. Dampak perlu diukur dengan baseline proses dan hasil pilot yang disepakati. Kemampuan validasi, tugas, audit dan verifikasi mendukung hipotesis manfaat, tetapi tidak membuktikan besaran dampaknya.', ['docs/PRD_MOBILE_V1.md §1.2–1.3','routes/web.php','resources/mobile/src/execution-panel.tsx','app/Actions/Handover/VerifyItem.php','Brief pengguna §6']);
}
// 15
{
 const s=slide('Roadmap pengembangan platform','Rencana pengembangan. Urutan dan jadwal menunggu prioritas serta validasi kebutuhan.');
 table(s,[['Arah pengembangan','Fokus nilai operasional'],['Pickup Reporting & Performance Analytics','Laporan dan evaluasi kinerja berbasis data pickup'],['Cashless Handover via JNE Hybrid','Konsep / PoC validasi AWB dan proses HO berotorisasi'],['Shipment / AWB Monitoring','Pemantauan kiriman setelah pickup'],['Customer Portal','Akses pelanggan ke informasi dan layanan yang disepakati'],['Fleet / Vehicle Usage + ERP','Keterkaitan penggunaan kendaraan dan sistem ERP']],80,270,1440,420,[650,790]);
 txt(s,'Modul retail lainnya dapat menyusul setelah kebutuhan dan kelayakan disepakati.',80,730,1430,65,27,C.muted);
 notes(s,'Roadmap berasal dari brief pengguna dan batas out-of-scope Mobile V1, bukan backlog dengan tanggal komitmen. Monitoring operasional/dashboard sudah ada; reporting/performance analytics adalah perluasan. Kategori jumlah Cashless Hybrid yang sudah ada di POP tidak berarti integrasi cashless handover sudah selesai. Tidak ada klaim AWB scanning, customer portal, fleet integration atau Hybrid API produksi tersedia. Absensi terlihat sebagai placeholder app shell tetapi tidak diprioritaskan sebagai komitmen roadmap.', ['Brief pengguna §7','docs/PRD_MOBILE_V1.md §2.2','resources/mobile/src/app.tsx daftar modul','docs/mobile/IMPLEMENTATION_PLAN.md §16']);
}
// 16
{
 const s=slide('Konsep cashless handover melalui JNE Hybrid','KONSEP / PoC. Belum merupakan integrasi produksi.');
 txt(s,'Satu pickup = satu cashless HO',80,280,1400,65,47,C.blue,true);
 const ns=[node(s,'Petugas scan\nAWB satu per satu',80,405,300,125,C.warm,C.amber,C.amber,28),node(s,'Validasi\nJNE Hybrid',485,405,300,125,C.warm,C.amber,C.amber,28),node(s,'Hasil validasi\ntampil ke petugas',890,405,300,125,C.warm,C.amber,C.amber,28)];connect(s,ns[0],ns[1],'right','left',true);connect(s,ns[1],ns[2],'right','left',true);
 const office=node(s,'Integrasi / bot sisi kantor yang berotorisasi\nmemproses HO sesuai akses dan prosedur resmi',480,640,900,95,C.white,C.amber,C.amber,28);connect(s,ns[2],office,'bottom','top',true);
 label(s,'Kelayakan, akses resmi, penanganan respons, dan kontrol operasional perlu dibuktikan melalui PoC.',80,755,1440,C.muted,22);
 notes(s,'Konsep secara eksplisit diminta pengguna. Satu pickup berkaitan dengan satu cashless handover, staff scan AWB individual, respons validasi Hybrid tampil di aplikasi, authorized office-side integration/bot dapat memproses HO. Belum ada production integration, AWB scanning atau validasi Hybrid yang terverifikasi dalam repository. Ketersediaan API, akses bot, izin, kontrak layanan, sistem record dan detail exception handling belum dikonfirmasi. Diagram tidak menjanjikan akses bypass atau otomatisasi tanpa otorisasi. Seluruh node dan label editable.', ['Brief pengguna §7','docs/PRD_MOBILE_V1.md §2.2']);
}
// 17
{
 const s=slide('Langkah berikutnya menuju pilot terkontrol','Usulan tahapan keputusan. Pilot dimulai setelah gate kesiapan disetujui.');
 row(s,1,'UAT operasional pada perangkat nyata','Uji alur normal, tanpa paket, konflik tugas, jaringan putus, draft, handover, dan FCM.',280,{w:1440});
 row(s,2,'Kesiapan rilis dan dukungan','Tetapkan perangkat, HTTPS, signing, distribusi pembaruan, rollback, dan pemilik dukungan.',430,{w:1440});
 row(s,3,'Pilot terbatas setelah persetujuan','Sepakati cabang, pengguna, durasi, baseline, serta kriteria keberhasilan.',580,{w:1440});
 txt(s,'Evaluasi hasil pilot menjadi dasar perbaikan dan prioritas roadmap.',166,737,1330,48,29,C.blue,true);
 notes(s,'Usulan next steps mengikuti remaining gates, bukan approval untuk melakukan pilot saat ini. UAT-01 sampai UAT-12 mencakup login, takeover success/conflict, POP, NO_PACKAGES, restart, timeout, ownership lost, handover, unauthorized, receipt status dan web/mobile consistency. Tambahkan manual customer/bulk/Admin push UAT terbaru, real FCM foreground/background/cold tap dan signed upgrade/physical fleet. Kriteria keberhasilan dan baseline proses perlu kesepakatan bisnis; tidak menetapkan target numerik tanpa evidence.', ['docs/PRD_MOBILE_V1.md §12–13 dan UAT-01–12','docs/mobile/IMPLEMENTATION_PLAN.md §19–23']);
}
// 18
{
 const s=slide('Fondasi pickup untuk operasi retail yang terhubung','','Diskusi manajemen   /   Retail Operations Platform',C.pale);
 txt(s,'Pickup Management telah tersedia.\nValidasi operasional menjadi\nlangkah keputusan berikutnya.',80,280,1400,220,64,C.blue,true);
 rule(s,80,570,1440,C.line);
 txt(s,'Fokus diskusi',80,620,400,50,30,C.red,true);
 txt(s,'Cakupan UAT dan calon pilot\nPenanggung jawab operasional serta dukungan\nPrioritas pengembangan setelah evaluasi',530,620,970,145,31,C.ink);
 notes(s,'Penutup membedakan implementasi teknis dari kesiapan pilot. Meminta diskusi scope dan ownership, bukan menyatakan persetujuan pilot telah diperoleh. Narasi inti: satu alur dari penugasan, pekerjaan lapangan, bukti, handover dan visibilitas, kemudian perluasan terukur setelah UAT.', ['docs/PRD_MOBILE_V1.md §1, §13','docs/mobile/IMPLEMENTATION_PLAN.md §23']);
}
await fs.writeFile(ROOT+'/.build/source-notes.json',JSON.stringify(sourceNotes,null,2));
await fs.writeFile(ROOT+'/.build/deck.proto.json',JSON.stringify(P.toProto()));
const draft=ROOT+'/.build/candidate.pptx';await(await PresentationFile.exportPptx(P)).save(draft);console.log('DRAFT_EXPORTED',P.slides.items.length);
for(let i=0;i<P.slides.items.length;i++){
 const b=await P.export({slide:P.slides.items[i],format:'png',scale:1});const bytes=new Uint8Array(await b.arrayBuffer());await fs.writeFile(ROOT+'/.build/renders/slide-'+String(i+1).padStart(2,'0')+'.png',bytes);
 if([5,12,16].includes(i+1))await fs.writeFile(ROOT+'/assets/'+({5:'pickup-workflow',12:'system-architecture',16:'cashless-concept'}[i+1])+'.png',bytes);
 console.log('RENDER',i+1);
}
const {finalizePresentation}=await import(pathToFileURL(SKILL+'/container_tools/artifact_tool_utils.mjs').href);
try{
 await fs.mkdir(ROOT+'/deliverables',{recursive:true});
 const r=await finalizePresentation({workspaceDir:ROOT,candidatePath:draft,finalPath:ROOT+'/deliverables/Retail_Operations_Platform_Presentation.pptx',pythonExecutable:'C:/Users/copol/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',integrityValidatorPath:SKILL+'/container_tools/inspect_presentation_package_integrity.py',layoutValidatorPath:SKILL+'/container_tools/inspect_presentation_layout_geometry.py',layoutArgs:['--expected-slide-size-emu','15240000,8572500','--validate-heading-fit',...[4,13,15].flatMap(n=>['--require-native-table-slide',String(n)])],explicitTotalSlideCount:18,requiredNativeTableOwnerSlides:[4,13,15],fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,receiptPath:ROOT+'/.build/validation.json'});console.log('FINALIZED',JSON.stringify(r));
}catch(e){console.error('FINALIZER_ERROR',String(e));process.exitCode=2;}
try{await fs.writeFile(ROOT+'/.build/artifact-preview.pdf',new Uint8Array(await(await P.export({format:'pdf'})).arrayBuffer()));console.log('PDF_EXPORTED');}catch(e){console.log('PDF_ENGINE_LIMITATION',String(e).slice(0,500));}
console.log('BUILD_FINISHED');
