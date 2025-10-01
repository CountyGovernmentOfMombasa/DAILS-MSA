const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
// We'll apply encryption after generating the PDF using hummus-recipe (writes to disk).
let hummusAvailable = false;
let HummusRecipe = null;
try {
  HummusRecipe = require('hummus-recipe');
  hummusAvailable = true;
} catch (e) {
  hummusAvailable = false; // dependency missing, proceed without encryption
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
  const debug = String(process.env.PDF_DEBUG||'').toLowerCase() === '1';
  const safeParse = (v)=>{
    if(!v) return [];
    if(Array.isArray(v)) return v;
    if(typeof v==='string') {
      try {
        const p = JSON.parse(v);
        return safeParse(p); // recurse to handle nested form
      } catch {
        // Try to coerce legacy string lists separated by semicolons: type|description|value;...
        if(/\|/.test(v) && /;/.test(v)) {
          return v.split(';').map(seg=>{
            const parts = seg.split('|');
            return { type: parts[0]||'', description: parts[1]||'', value: Number(parts[2]||0) };
          }).filter(r=>r.type||r.description||r.value);
        }
        return [];
      }
    }
    if (typeof v === 'object') {
      // If object has numeric keys -> treat as array-like
      const keys = Object.keys(v);
      if (keys.every(k=>/^\d+$/.test(k))) {
        return keys.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);
      }
      // If it looks like a single item (has type/description/value)
      if ('type' in v || 'description' in v || 'value' in v) {
        return [v];
      }
      // If it contains nested arrays under known keys, flatten them (legacy wrapper)
      const possible = []; ['biennial_income','income','assets','liabilities','items'].forEach(k=>{ if(Array.isArray(v[k])) possible.push(...v[k]); });
      if (possible.length) return possible;
      return [];
    }
    return [];
  };
  // Preserve all original asset fields so description builders (e.g. Land: title_deed, location, etc.) can access them
  const mapAsset = a=>{
    if(!a || typeof a !== 'object') return { type:'Asset', description:'', value:0 };
    const type = a.type||a.item_type||a.asset_type||'Asset';
    const description = a.description||a.details||'';
    const value = a.value!=null ? a.value : (a.amount||0);
    const asset_other_type = a.asset_other_type;
    return { ...a, type, description, value, asset_other_type };
  };
  // Include liability_other_description so we can display extended details in PDF
  const mapLiability = l=>{
    if(!l || typeof l !== 'object') return { type:'Liability', description:'', value:0 };
    const type = l.type||l.item_type||l.liability_type||'Liability';
    const description = l.description||l.details||'';
    const value = l.value!=null ? l.value : (l.amount||0);
    const liability_other_type = l.liability_other_type;
    const liability_other_description = l.liability_other_description;
    return { ...l, type, description, value, liability_other_type, liability_other_description };
  };
  let rawIncomeParsed = safeParse(full.base.biennial_income);
  if (!rawIncomeParsed.length && typeof full.base.biennial_income === 'string' && /^\d+(\.\d+)?$/.test(full.base.biennial_income.trim())) {
    // Legacy case: stored as a single numeric string value
    rawIncomeParsed = [{ type: 'Income', description: 'Biennial Income', value: Number(full.base.biennial_income) }];
  }
  let rootIncome = rawIncomeParsed.map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 }));
  let rootAssets = safeParse(full.base.assets).map(mapAsset);
  let rootLiabilities = safeParse(full.base.liabilities).map(mapLiability);
  const finDeclExpanded = full.finDecls.map(fd=>{ const items = full.finItems.filter(it=>it.financial_declaration_id===fd.id); return { ...fd, incomes: items.filter(i=>i.item_type==='income').map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 })), assets: items.filter(i=>i.item_type==='asset').map(mapAsset), liabilities: items.filter(i=>i.item_type==='liability').map(mapLiability) }; });
  let spousesArr = full.spouses.map(s=>({ name:[s.first_name,s.other_names,s.surname].filter(Boolean).join(' '), incomes:safeParse(s.biennial_income).map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 })), assets:safeParse(s.assets).map(mapAsset), liabilities:safeParse(s.liabilities).map(mapLiability) }));
  let childrenArr = full.children.map(c=>({ name:[c.first_name,c.other_names,c.surname].filter(Boolean).join(' '), incomes:safeParse(c.biennial_income).map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 })), assets:safeParse(c.assets).map(mapAsset), liabilities:safeParse(c.liabilities).map(mapLiability) }));
  // If root sections are empty but there is a user financial declaration, promote its data to root.
  if (!rootIncome.length && !rootAssets.length && !rootLiabilities.length) {
    const userIdx = finDeclExpanded.findIndex(fd => (fd.member_type||'').toLowerCase() === 'user');
    if (userIdx !== -1) {
      const userFD = finDeclExpanded[userIdx];
      rootIncome = userFD.incomes || [];
      rootAssets = userFD.assets || [];
      rootLiabilities = userFD.liabilities || [];
      // Remove the promoted user entry to avoid duplication in PDF sections
      finDeclExpanded.splice(userIdx,1);
    }
  }
  // Additional fallback: if still empty, attempt to derive from any financial_declaration even if member_type not explicitly 'user'
  if (!rootIncome.length && finDeclExpanded.length) {
    const first = finDeclExpanded[0];
    rootIncome = first.incomes || [];
    if (!rootAssets.length) rootAssets = first.assets || [];
    if (!rootLiabilities.length) rootLiabilities = first.liabilities || [];
  }
  // Filter out empty spouse/child (no name & no financial data)
  const nonEmpty = e => (e.name && e.name.trim().length) || (e.incomes && e.incomes.length) || (e.assets && e.assets.length) || (e.liabilities && e.liabilities.length);
  spousesArr = spousesArr.filter(nonEmpty);
  childrenArr = childrenArr.filter(nonEmpty);
  // Also drop any spouse/child finDecl entries that have zero items to prevent blank tables
  for (let i = finDeclExpanded.length - 1; i >=0; i--) {
    const fd = finDeclExpanded[i];
    if ((fd.member_type === 'spouse' || fd.member_type === 'child') && !fd.incomes.length && !fd.assets.length && !fd.liabilities.length) {
      finDeclExpanded.splice(i,1);
    }
  }
  if (debug) {
    console.log('[PDF_DEBUG] Declaration', full.base.id, 'rootIncome', rootIncome.length, 'rootAssets', rootAssets.length, 'rootLiabilities', rootLiabilities.length, 'finDeclExpanded', finDeclExpanded.length, 'spouses', spousesArr.length, 'children', childrenArr.length);
  }
  return { rootIncome, rootAssets, rootLiabilities, finDeclExpanded, spousesArr, childrenArr };
}

function buildPDF({ declarationId, base, normalized }) {
  // Base PDF generation without encryption (will encrypt in a second pass if enabled)
  const doc = new PDFDocument({ margin: 28 });
  const buffers=[]; doc.on('data',d=>buffers.push(d));
  const pageWidth=()=> doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const moneyFormatter = new Intl.NumberFormat('en-KE',{ minimumFractionDigits:2, maximumFractionDigits:2 });
  const formatMoney = (val) => {
    const num = Number(val);
    if (isNaN(num)) return val === undefined || val === null ? '' : String(val);
    return 'KES ' + moneyFormatter.format(num);
  };
  const buildAssetDescription = (a)=>{
    if(!a || typeof a !== 'object') return '';
    const base = (a.description || a.details || '').trim();
    const parts = [];
    if (a.make) parts.push(`Make: ${a.make}`);
    if (a.model) parts.push(`Model: ${a.model}`);
    if (a.licence_no) parts.push(`Licence: ${a.licence_no}`);
    if (a.title_deed) parts.push(`Title Deed: ${a.title_deed}`);
    if (a.location) parts.push(`Location: ${a.location}`);
    if (a.asset_other_type && a.type === 'Other') parts.push(`Type: ${a.asset_other_type}`);
    const extra = parts.join(', ');
    if (base && extra) return `${base} (${extra})`;
    return base || extra;
  };
  const buildLiabilityDescription = (l)=>{
    if(!l || typeof l !== 'object') return '';
    const base = (l.description || l.details || '').trim();
    const parts = [];
    if (l.liability_other_type && l.type === 'Other') parts.push(`Type: ${l.liability_other_type}`);
    if (l.liability_other_description) parts.push(`Details: ${l.liability_other_description}`);
    const extra = parts.join(', ');
    if (base && extra) return `${base} (${extra})`;
    return base || extra;
  };
  const fmtDate = (val)=> {
    if(!val) return '';
    // Accept Date, ISO string, MySQL datetime
    if (val instanceof Date) return val.toISOString().slice(0,10);
    const s = String(val).trim();
    // Already date only
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // MySQL datetime or other parseable string
    const d = new Date(s.replace(' ', 'T'));
    if(!isNaN(d)) return d.toISOString().slice(0,10);
    return s; // fallback original
  };
  const addHeader=()=>{ try{ const logo=path.resolve(__dirname,'../../my-app/public/logo192.png'); if(fs.existsSync(logo)) doc.image(logo, doc.page.margins.left, 20, { width:60 }); }catch{} doc.fontSize(14).font('Helvetica-Bold').text('DECLARATION OF INCOME, ASSETS AND LIABILITIES',{align:'center'}); doc.moveDown(0.2).fontSize(11).font('Helvetica').text('County Government of Mombasa',{align:'center'}); doc.moveDown(); };
  const ensureSpace=n=>{ if(doc.y + n > doc.page.height - doc.page.margins.bottom){ doc.addPage(); addHeader(); } };
  const section=t=>{ ensureSpace(30); doc.moveDown(0.4); doc.fontSize(12).font('Helvetica-Bold').fillColor('#003366').text(t); doc.moveDown(0.2).fontSize(9).font('Helvetica').fillColor('#000'); };
  const kv=(k,v)=>{ ensureSpace(18); doc.font('Helvetica-Bold').text(k+': ',{continued:true}); doc.font('Helvetica').text(v||''); doc.moveDown(0.15); };
  const table=(rows,headers)=>{
    if(!rows.length){ doc.font('Helvetica-Oblique').text('None'); return; }
    const w=pageWidth();
    const colWidths=headers.map(()=>Math.floor(w/headers.length));
    const startXBase = doc.x;
    const drawRow=(vals,isHeader=false)=>{
      ensureSpace(24);
      const startX = startXBase;
      let rowY = doc.y;
      // measure heights
      const cellHeights = vals.map((val,i)=>{
        const text = String(val).substring(0,300) || '';
        return doc.heightOfString(text, { width: colWidths[i], align:'left' });
      });
      const paddingY = 4;
      const rowHeight = Math.max(...cellHeights) + paddingY*2;
      // background for header
      if (isHeader) {
        doc.save().rect(startX, rowY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill('#f0f0f0').restore();
      }
      // cell borders + text
      let offsetX = startX;
      vals.forEach((val,i)=>{
        const cellWidth = colWidths[i];
        // border
        doc.rect(offsetX, rowY, cellWidth, rowHeight).stroke();
        // text
        doc.font(isHeader?'Helvetica-Bold':'Helvetica').fontSize(isHeader?9:8).fillColor('#000');
        doc.text(String(val).substring(0,300), offsetX+3, rowY+paddingY, { width: cellWidth-6, continued:false });
        offsetX += cellWidth;
      });
      doc.y = rowY + rowHeight; // move cursor
      doc.x = startX;
    };
    drawRow(headers,true);
    rows.forEach(r=> drawRow(r,false));
  doc.moveDown(0.5);
  };
  addHeader();
  section('Declaration Overview'); kv('Declaration ID', declarationId); kv('Declaration Type', base.declaration_type||''); kv('Submitted At', fmtDate(base.submitted_at)||fmtDate(base.created_at)||''); kv('Status', base.status||'pending'); if (base.correction_message) kv('Correction Message', base.correction_message);
  section('Employee Profile'); const fullName=[base.surname, base.first_name, base.other_names].filter(Boolean).join(', '); kv('Name', fullName); kv('National ID', base.national_id||''); kv('Payroll Number', base.payroll_number||''); kv('Department', base.department||''); kv('Designation', base.designation||''); kv('Marital Status', base.marital_status||base.user_marital_status||''); kv('Birthdate', fmtDate(base.birthdate)||''); kv('Place of Birth', base.place_of_birth||''); kv('Email', base.email||''); kv('Postal Address', base.postal_address||''); kv('Physical Address', base.physical_address||''); kv('Nature of Employment', base.nature_of_employment||'');
  section('Financial Period'); kv('Period Start', fmtDate(base.period_start_date || (normalized.finDeclExpanded[0]?.period_start_date) || '')); kv('Period End', fmtDate(base.period_end_date || (normalized.finDeclExpanded[0]?.period_end_date) || ''));

  // Integrate root financial data into the Financial Declaration list instead of separate root sections
  const userDisplayName = [base.surname, base.first_name, base.other_names].filter(Boolean).join(' ').trim() || 'User';
  if ((normalized.rootIncome && normalized.rootIncome.length) || (normalized.rootAssets && normalized.rootAssets.length) || (normalized.rootLiabilities && normalized.rootLiabilities.length)) {
    // Try to find existing user declaration to merge into
    let existingUser = normalized.finDeclExpanded.find(fd => (fd.member_type||'').toLowerCase() === 'user');
    if (!existingUser) {
      normalized.finDeclExpanded.unshift({
        member_type: 'user',
        member_name: userDisplayName,
        declaration_date: base.declaration_date || new Date().toISOString().slice(0,10),
        period_start_date: base.period_start_date || normalized.finDeclExpanded[0]?.period_start_date || base.period_start || '',
        period_end_date: base.period_end_date || normalized.finDeclExpanded[0]?.period_end_date || base.period_end || '',
        incomes: [...(normalized.rootIncome||[])],
        assets: [...(normalized.rootAssets||[])],
        liabilities: [...(normalized.rootLiabilities||[])]
      });
    } else {
      // Merge without duplicating identical objects (simple JSON string match uniqueness)
      const uniqMerge = (targetArr, addArr) => {
        const seen = new Set(targetArr.map(o=>JSON.stringify(o)));
        addArr.forEach(o=>{ const s=JSON.stringify(o); if(!seen.has(s)){ seen.add(s); targetArr.push(o);} });
      };
      uniqMerge(existingUser.incomes, normalized.rootIncome||[]);
      uniqMerge(existingUser.assets, normalized.rootAssets||[]);
      uniqMerge(existingUser.liabilities, normalized.rootLiabilities||[]);
    }
  }
  normalized.finDeclExpanded.forEach(fd=>{ section(`Financial Declaration – ${fd.member_type.toUpperCase()} (${fd.member_name})`); kv('Declaration Date', fmtDate(fd.declaration_date)||''); kv('Period', `${fmtDate(fd.period_start_date||'')} -> ${fmtDate(fd.period_end_date||'')}`); doc.font('Helvetica-Bold').text('Income:'); table((fd.incomes||[]).map(i=>[i.type,i.description,formatMoney(i.value)]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Assets:'); table((fd.assets||[]).map(a=>[a.type === 'Other' && a.asset_other_type ? a.asset_other_type : a.type, buildAssetDescription(a), formatMoney(a.value)]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Liabilities:'); table((fd.liabilities||[]).map(l=>[l.type === 'Other' && l.liability_other_type ? l.liability_other_type : l.type, buildLiabilityDescription(l), formatMoney(l.value)]), ['Type','Description','Value']); });
  normalized.spousesArr.forEach((s,i)=>{ section(`Spouse ${i+1}: ${s.name||'Unnamed'}`); doc.font('Helvetica-Bold').text('Income:'); table(s.incomes.map(i=>[i.type,i.description,formatMoney(i.value)]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Assets:'); table(s.assets.map(a=>[a.type === 'Other' && a.asset_other_type ? a.asset_other_type : a.type, buildAssetDescription(a), formatMoney(a.value)]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Liabilities:'); table(s.liabilities.map(l=>[l.type === 'Other' && l.liability_other_type ? l.liability_other_type : l.type, buildLiabilityDescription(l), formatMoney(l.value)]), ['Type','Description','Value']); });
  normalized.childrenArr.forEach((c,i)=>{ section(`Child ${i+1}: ${c.name||'Unnamed'}`); doc.font('Helvetica-Bold').text('Income:'); table(c.incomes.map(i=>[i.type,i.description,formatMoney(i.value)]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Assets:'); table(c.assets.map(a=>[a.type === 'Other' && a.asset_other_type ? a.asset_other_type : a.type, buildAssetDescription(a), formatMoney(a.value)]), ['Type','Description','Value']); doc.font('Helvetica-Bold').text('Liabilities:'); table(c.liabilities.map(l=>[l.type === 'Other' && l.liability_other_type ? l.liability_other_type : l.type, buildLiabilityDescription(l), formatMoney(l.value)]), ['Type','Description','Value']); });
  const sum=a=>a.reduce((t,x)=>t+(Number(x.value)||0),0); section('Totals Summary'); const allIncomes = normalized.finDeclExpanded.flatMap(f=>f.incomes||[]); const allAssets = normalized.finDeclExpanded.flatMap(f=>f.assets||[]); const allLiabilities = normalized.finDeclExpanded.flatMap(f=>f.liabilities||[]); kv('Total Income (All)', formatMoney(sum(allIncomes))); kv('Total Assets (All)', formatMoney(sum(allAssets))); kv('Total Liabilities (All)', formatMoney(sum(allLiabilities)));
  section('Signatures'); ensureSpace(80); doc.font('Helvetica').text('Declarant Signature: ______________________________'); doc.text('Date (YYYY-MM-DD): ____________________'); if (base.witness_name || base.witness_phone || base.witness_address){ doc.moveDown(); doc.text(`Witness Name: ${base.witness_name||''}`); doc.text(`Witness Phone: ${base.witness_phone||''}`); doc.text(`Witness Address: ${base.witness_address||''}`); if (base.witness_signed) doc.font('Helvetica-Oblique').text('(Witness signed)'); doc.font('Helvetica').text('Witness Signature: __________________________'); doc.text('Date (YYYY-MM-DD): ____________________'); } else { doc.moveDown(); doc.font('Helvetica-Oblique').text('No witness information provided.'); doc.font('Helvetica'); }
  ensureSpace(20); doc.moveDown(1).fontSize(8).fillColor('#555').text('Generated by Mombasa County DAILs Portal – retain for your records.', { align:'center', width: pageWidth() });
  doc.end();
  return new Promise(resolve => doc.on('end', ()=> resolve(Buffer.concat(buffers))));
}

function buildPermissionFlag(opts) {
  // Map boolean style env to permission bits understood by hummus-recipe / PDF standard
  // Bits: 4 print, 8 modify, 16 copy, 32 annotate, 256 fill forms, 512 content extraction, 1024 assemble, 2048 high quality print
  let flag = 0;
  if (opts.printing === 'low') flag |= 4; // low quality print
  if (opts.printing === 'high') flag |= 2048; // high quality print (also implies print ability in most viewers)
  if (opts.modifying) flag |= 8;
  if (opts.copying) flag |= 16;
  if (opts.annotating) flag |= 32;
  if (opts.fillingForms) flag |= 256;
  if (opts.contentAccessibility) flag |= 512;
  if (opts.documentAssembly) flag |= 1024;
  return flag;
}

function readEnvBool(name, def=false) {
  const v = process.env[name];
  if (v === undefined) return def;
  const s = String(v).trim().toLowerCase();
  return ['1','true','yes','y','on','allow','allowed'].includes(s);
}

function derivePermissionOptions() {
  const printingRaw = (process.env.PDF_PERMIT_PRINTING || 'high').toLowerCase();
  const printing = ['none','low','high'].includes(printingRaw) ? printingRaw : 'high';
  return {
    printing,
    modifying: readEnvBool('PDF_ALLOW_MODIFY'),
    copying: readEnvBool('PDF_ALLOW_COPY'),
    annotating: readEnvBool('PDF_ALLOW_ANNOTATE'),
    fillingForms: readEnvBool('PDF_ALLOW_FILL_FORMS'),
    contentAccessibility: readEnvBool('PDF_ALLOW_CONTENT_ACCESS'),
    documentAssembly: readEnvBool('PDF_ALLOW_DOC_ASSEMBLY')
  };
}

async function applyEncryptionIfPossible(buffer, base) {
  if (!hummusAvailable || !base?.national_id) {
    return { buffer, applied: false, password: null };
  }
  try {
    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(8).toString('hex');
    const srcPath = path.join(tmpDir, `decl-src-${id}.pdf`);
    const outPath = path.join(tmpDir, `decl-out-${id}.pdf`);
    fs.writeFileSync(srcPath, buffer);
    const perms = derivePermissionOptions();
    const userPassword = String(base.national_id);
    const ownerPassword = process.env.PDF_OWNER_PASSWORD || process.env.PDF_OWNER_SECRET || userPassword;
    const userProtectionFlag = buildPermissionFlag(perms);
    // Proper encryption invocation (constructor options do not apply encryption automatically)
    const recipe = new HummusRecipe(srcPath, outPath);
    recipe.encrypt({
      userPassword,
      ownerPassword,
      userProtectionFlag
    }).endPDF();
    const encrypted = fs.readFileSync(outPath);
    try { fs.unlinkSync(srcPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
    return { buffer: encrypted, applied: true, password: userPassword };
  } catch (e) {
    console.error('PDF encryption failed (continuing with unencrypted PDF):', e.message);
    return { buffer, applied: false, password: null };
  }
}

async function generateDeclarationPDF(declarationId) {
  const full = await fetchDeclarationFull(declarationId);
  const normalized = normalizeData(full);
  const rawBuffer = await buildPDF({ declarationId, base: full.base, normalized });
  const { buffer, applied, password } = await applyEncryptionIfPossible(rawBuffer, full.base);
  return { buffer, base: full.base, password, encryptionApplied: applied };
}

module.exports = { generateDeclarationPDF };