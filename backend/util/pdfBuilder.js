const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
// Attempt to load encryption plugin (adds password + permission support to pdfkit)
let encryptionPluginLoaded = false;
try { require('pdfkit-encrypt'); encryptionPluginLoaded = true; } catch (e) {
  // Plugin not installed; PDF will be generated without encryption.
}
const pool = require('../config/db');

// Fetch and normalize all declaration related data
async function fetchDeclarationFull(declarationId) {
  const [declUserRows] = await pool.query(`SELECT d.*, u.first_name, u.other_names, u.surname, u.email, u.national_id, u.payroll_number, u.department, u.designation, u.marital_status AS user_marital_status, u.birthdate, u.place_of_birth, u.postal_address, u.physical_address, u.nature_of_employment FROM declarations d JOIN users u ON d.user_id = u.id WHERE d.id = ?`, [declarationId]);
  const base = declUserRows[0] || {};
  const [spouses] = await pool.query('SELECT first_name, other_names, surname, biennial_income, assets, liabilities, other_financial_info FROM spouses WHERE declaration_id = ?', [declarationId]);
  const [children] = await pool.query('SELECT first_name, other_names, surname, biennial_income, assets, liabilities, other_financial_info FROM children WHERE declaration_id = ?', [declarationId]);
  const [finDecls] = await pool.query('SELECT id, member_type, member_name, declaration_date, period_start_date, period_end_date, other_financial_info FROM financial_declarations WHERE declaration_id = ?', [declarationId]);
  let finItems = [];
  if (finDecls.length) {
    const ids = finDecls.map(f=>f.id);
    const placeholders = ids.map(()=>'?').join(',');
    const [its] = await pool.query(`SELECT financial_declaration_id, item_type, type, description, value FROM financial_items WHERE financial_declaration_id IN (${placeholders})`, ids);
    finItems = its;
  }
  return { base, spouses, children, finDecls, finItems };
}

function normalizeData(full) {
  const safeParse = (v)=>{ if(!v) return []; if(Array.isArray(v)) return v; if(typeof v==='string'){ try{ const p=JSON.parse(v); return Array.isArray(p)?p:[];}catch{return [];} } return []; };
  const mapAsset = a=>({ type:a.type||a.item_type||a.asset_type||'Asset', description:a.description||a.details||'', value:a.value||a.amount||0, asset_other_type:a.asset_other_type });
  const mapLiability = l=>({ type:l.type||l.item_type||l.liability_type||'Liability', description:l.description||l.details||'', value:l.value||l.amount||0, liability_other_type:l.liability_other_type });
  const rootIncome = safeParse(full.base.biennial_income).map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 }));
  const rootAssets = safeParse(full.base.assets).map(mapAsset);
  const rootLiabilities = safeParse(full.base.liabilities).map(mapLiability);
  const finDeclExpanded = full.finDecls.map(fd=>{ const items = full.finItems.filter(it=>it.financial_declaration_id===fd.id); return { ...fd, incomes: items.filter(i=>i.item_type==='income').map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 })), assets: items.filter(i=>i.item_type==='asset').map(mapAsset), liabilities: items.filter(i=>i.item_type==='liability').map(mapLiability) }; });
  const spousesArr = full.spouses.map(s=>({ name:[s.first_name,s.other_names,s.surname].filter(Boolean).join(' '), incomes:safeParse(s.biennial_income).map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 })), assets:safeParse(s.assets).map(mapAsset), liabilities:safeParse(s.liabilities).map(mapLiability) }));
  const childrenArr = full.children.map(c=>({ name:[c.first_name,c.other_names,c.surname].filter(Boolean).join(' '), incomes:safeParse(c.biennial_income).map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 })), assets:safeParse(c.assets).map(mapAsset), liabilities:safeParse(c.liabilities).map(mapLiability) }));
  return { rootIncome, rootAssets, rootLiabilities, finDeclExpanded, spousesArr, childrenArr };
}

function buildPDF({ declarationId, base, normalized }) {
  // Build encryption/permission options if plugin is available and national ID present
  const pdfOptions = { margin: 28 };

  if (encryptionPluginLoaded && base && base.national_id) {
    const parseBool = (v, def=false)=>{
      if(v===undefined||v===null||v==='') return def; const s=String(v).trim().toLowerCase();
      return ['1','true','yes','y','on','allow','allowed'].includes(s);
    };
    const printingEnv = process.env.PDF_PERMIT_PRINTING || 'high';
    let printingPerm;
    switch (printingEnv.toLowerCase()) {
      case 'none':
      case 'false':
        printingPerm = false; break;
      case 'low':
      case 'lowres':
      case 'lowresolution':
        printingPerm = 'lowResolution'; break;
      case 'high':
      case 'hi':
      case 'highres':
      default:
        printingPerm = 'highResolution';
    }
    const permissions = {
      printing: printingPerm,
      modifying: parseBool(process.env.PDF_ALLOW_MODIFY, false),
      copying: parseBool(process.env.PDF_ALLOW_COPY, false),
      annotating: parseBool(process.env.PDF_ALLOW_ANNOTATE, false),
      fillingForms: parseBool(process.env.PDF_ALLOW_FILL_FORMS, false),
      contentAccessibility: parseBool(process.env.PDF_ALLOW_CONTENT_ACCESS, false),
      documentAssembly: parseBool(process.env.PDF_ALLOW_DOC_ASSEMBLY, false)
    };
    // Owner password can be provided via env for stronger control; fallback to same as user password
    const ownerPassword = process.env.PDF_OWNER_PASSWORD || process.env.PDF_OWNER_SECRET || String(base.national_id);
    pdfOptions.userPassword = String(base.national_id);
    pdfOptions.ownerPassword = ownerPassword;
    pdfOptions.permissions = permissions;
  }

  const doc = new PDFDocument(pdfOptions);
  const buffers=[]; doc.on('data',d=>buffers.push(d));
  const pageWidth=()=> doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const addHeader=()=>{ try{ const logo=path.resolve(__dirname,'../../my-app/public/logo192.png'); if(fs.existsSync(logo)) doc.image(logo, doc.page.margins.left, 20, { width:60 }); }catch{} doc.fontSize(14).font('Helvetica-Bold').text('DECLARATION OF INCOME, ASSETS AND LIABILITIES',{align:'center'}); doc.moveDown(0.2).fontSize(11).font('Helvetica').text('County Government of Mombasa',{align:'center'}); doc.moveDown(); };
  const ensureSpace=n=>{ if(doc.y + n > doc.page.height - doc.page.margins.bottom){ doc.addPage(); addHeader(); } };
  const section=t=>{ ensureSpace(30); doc.moveDown(0.4); doc.fontSize(12).font('Helvetica-Bold').fillColor('#003366').text(t); doc.moveDown(0.2).fontSize(9).font('Helvetica').fillColor('#000'); };
  const kv=(k,v)=>{ ensureSpace(14); doc.font('Helvetica-Bold').text(k+': ',{continued:true}); doc.font('Helvetica').text(v||''); };
  const table=(rows,headers)=>{ if(!rows.length){ doc.font('Helvetica-Oblique').text('None'); return;} const w=pageWidth(); const colWidths=headers.map(()=>Math.floor(w/headers.length)); const draw=(vals,head=false)=>{ ensureSpace(18); vals.forEach((val,i)=>{ doc.font(head?'Helvetica-Bold':'Helvetica').fontSize(head?9:8).text(String(val).substring(0,140), doc.x + (i===0?0:colWidths.slice(0,i).reduce((a,b)=>a+b,0)), doc.y,{width:colWidths[i]}); }); doc.moveDown(0.6); }; draw(headers,true); rows.forEach(r=>draw(r)); };
  addHeader();
  section('Declaration Overview'); kv('Declaration ID', declarationId); kv('Declaration Type', base.declaration_type||''); kv('Submitted At', base.submitted_at||base.created_at||''); kv('Status', base.status||'pending'); if (base.correction_message) kv('Correction Message', base.correction_message);
  section('Employee Profile'); const fullName=[base.surname, base.first_name, base.other_names].filter(Boolean).join(', '); kv('Name', fullName); kv('National ID', base.national_id||''); kv('Payroll Number', base.payroll_number||''); kv('Department', base.department||''); kv('Designation', base.designation||''); kv('Marital Status', base.marital_status||base.user_marital_status||''); kv('Birthdate', base.birthdate||''); kv('Place of Birth', base.place_of_birth||''); kv('Email', base.email||''); kv('Postal Address', base.postal_address||''); kv('Physical Address', base.physical_address||''); kv('Nature of Employment', base.nature_of_employment||'');
  section('Financial Period'); kv('Period Start', base.period_start_date || (normalized.finDeclExpanded[0]?.period_start_date) || ''); kv('Period End', base.period_end_date || (normalized.finDeclExpanded[0]?.period_end_date) || '');
  section('Biennial Income (Root)'); table(normalized.rootIncome.map(i=>[i.type,i.description,i.value]), ['Type','Description','Value']);
  section('Assets (Root)'); table(normalized.rootAssets.map(a=>[a.type === 'Other' && a.asset_other_type ? a.asset_other_type : a.type,a.description,a.value]), ['Type','Description','Value']);
  section('Liabilities (Root)'); table(normalized.rootLiabilities.map(l=>[l.type === 'Other' && l.liability_other_type ? l.liability_other_type : l.type,l.description,l.value]), ['Type','Description','Value']);
  normalized.finDeclExpanded.forEach(fd=>{ section(`Financial Declaration – ${fd.member_type.toUpperCase()} (${fd.member_name})`); kv('Declaration Date', fd.declaration_date||''); kv('Period', `${fd.period_start_date||''} -> ${fd.period_end_date||''}`); doc.font('Helvetica-Bold').text('Income:'); table(fd.incomes.map(i=>[i.type,i.description,i.value]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Assets:'); table(fd.assets.map(a=>[a.type,a.description,a.value]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Liabilities:'); table(fd.liabilities.map(l=>[l.type,l.description,l.value]), ['Type','Description','Value']); });
  normalized.spousesArr.forEach((s,i)=>{ section(`Spouse ${i+1}: ${s.name||'Unnamed'}`); doc.font('Helvetica-Bold').text('Income:'); table(s.incomes.map(i=>[i.type,i.description,i.value]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Assets:'); table(s.assets.map(a=>[a.type,a.description,a.value]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Liabilities:'); table(s.liabilities.map(l=>[l.type,l.description,l.value]), ['Type','Description','Value']); });
  normalized.childrenArr.forEach((c,i)=>{ section(`Child ${i+1}: ${c.name||'Unnamed'}`); doc.font('Helvetica-Bold').text('Income:'); table(c.incomes.map(i=>[i.type,i.description,i.value]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Assets:'); table(c.assets.map(a=>[a.type,a.description,a.value]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Liabilities:'); table(c.liabilities.map(l=>[l.type,l.description,l.value]), ['Type','Description','Value']); });
  const sum=a=>a.reduce((t,x)=>t+(Number(x.value)||0),0); section('Totals Summary'); kv('Total Root Income', sum(normalized.rootIncome)); kv('Total Root Assets', sum(normalized.rootAssets)); kv('Total Root Liabilities', sum(normalized.rootLiabilities)); kv('Total Financial Decl. Income', sum(normalized.finDeclExpanded.flatMap(f=>f.incomes))); kv('Total Financial Decl. Assets', sum(normalized.finDeclExpanded.flatMap(f=>f.assets))); kv('Total Financial Decl. Liabilities', sum(normalized.finDeclExpanded.flatMap(f=>f.liabilities)));
  section('Signatures'); ensureSpace(80); doc.font('Helvetica').text('Declarant Signature: ______________________________'); doc.text('Date: ____________________'); if (base.witness_name || base.witness_phone || base.witness_address){ doc.moveDown(); doc.text(`Witness Name: ${base.witness_name||''}`); doc.text(`Witness Phone: ${base.witness_phone||''}`); doc.text(`Witness Address: ${base.witness_address||''}`); if (base.witness_signed) doc.font('Helvetica-Oblique').text('(Witness signed)'); doc.font('Helvetica').text('Witness Signature: __________________________'); doc.text('Date: ____________________'); } else { doc.moveDown(); doc.font('Helvetica-Oblique').text('No witness information provided.'); doc.font('Helvetica'); }
  ensureSpace(20); doc.moveDown(1).fontSize(8).fillColor('#555').text('Generated by Mombasa County DAILs Portal – retain for your records.', { align:'center', width: pageWidth() });
  doc.end();
  return new Promise(resolve => doc.on('end', ()=> resolve(Buffer.concat(buffers))));
}

async function generateDeclarationPDF(declarationId) {
  const full = await fetchDeclarationFull(declarationId);
  const normalized = normalizeData(full);
  const buffer = await buildPDF({ declarationId, base: full.base, normalized });
  return { buffer, base: full.base, password: (encryptionPluginLoaded && full.base?.national_id) ? String(full.base.national_id) : null, encryptionApplied: encryptionPluginLoaded };
}

module.exports = { generateDeclarationPDF };