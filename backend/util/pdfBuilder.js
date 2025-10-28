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
  // financial tables removed – derive everything from root/spouses/children JSON blobs
  return { base, spouses, children };
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
  const finDeclExpanded = []; // no separate financial declarations anymore
  let spousesArr = full.spouses.map(s=>({ name:[s.first_name,s.other_names,s.surname].filter(Boolean).join(' '), incomes:safeParse(s.biennial_income).map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 })), assets:safeParse(s.assets).map(mapAsset), liabilities:safeParse(s.liabilities).map(mapLiability) }));
  let childrenArr = full.children.map(c=>({ name:[c.first_name,c.other_names,c.surname].filter(Boolean).join(' '), incomes:safeParse(c.biennial_income).map(i=>({ type:i.type||i.description||'Income', description:i.description||'', value:i.value||0 })), assets:safeParse(c.assets).map(mapAsset), liabilities:safeParse(c.liabilities).map(mapLiability) }));
  // If root sections are empty but there is a user financial declaration, promote its data to root.
  // No financial tables fallback required now
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
  // Use A4 portrait and wider margins to resemble the official form print
  const doc = new PDFDocument({ margin: 56, size: 'A4' });
  const buffers=[]; doc.on('data',d=>buffers.push(d));
  const pageWidth=()=> doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let pageCounter = 1;
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
    if (a.type === 'Land' && a.size) {
      const unit = a.size_unit ? a.size_unit : '';
      parts.push(`Size: ${a.size}${unit ? ' '+unit : ''}`);
    }
    if (a.asset_other_type) parts.push(`Type: ${a.asset_other_type}`);
    const extra = parts.join(', ');
    if (base && extra) return `${base} (${extra})`;
    return base || extra;
  };
  const buildLiabilityDescription = (l)=>{
    if(!l || typeof l !== 'object') return '';
    const base = (l.description || l.details || '').trim();
    const parts = [];
    if (l.liability_other_type) parts.push(`Type: ${l.liability_other_type}`);
    if (l.liability_other_description) parts.push(`Details: ${l.liability_other_description}`);
    const extra = parts.join(', ');
    if (base && extra) return `${base} (${extra})`;
    return base || extra;
  };
  const fmtDate = (val)=> {
    if(!val) return '';
    // Accept Date, ISO string, MySQL datetime
    if (val instanceof Date) {
      return `${val.getDate().toString().padStart(2,'0')}/${(val.getMonth()+1).toString().padStart(2,'0')}/${val.getFullYear()}`;
    }
    const s = String(val).trim();
    // Already date only
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split('-');
      return `${d}/${m}/${y}`;
    }
    // MySQL datetime or other parseable string
    const d = new Date(s.replace(' ', 'T'));
    if(!isNaN(d)) return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    return s; // fallback original
  };
  const addHeader=()=>{
    // Add county logo at the top center
    const logoPath = path.resolve(__dirname, '../../my-app/public/logo192.png');
    const logoWidth = 100;
    const logoY = 50;
    if (fs.existsSync(logoPath)) {
      const centerX = doc.page.margins.left + (pageWidth() - logoWidth) / 2;
      doc.image(logoPath, centerX, logoY, { width: logoWidth });
      doc.y = logoY + logoWidth + 8;
    } else {
      doc.y = 60;
    }
    doc.font('Times-Bold').fontSize(20).text('COUNTY GOVERNMENT OF MOMBASA', doc.page.margins.left, doc.y, { width: pageWidth(), align:'center' });
    doc.moveDown(0.1);
    doc.font('Times-Bold').fontSize(20).text('MOMBASA COUNTY PUBLIC SERVICE BOARD', doc.page.margins.left, doc.y, { width: pageWidth(), align:'center' });
    doc.moveDown(0.5);
    doc.font('Times-Bold').fontSize(15).text('DECLARATION OF INCOME, ASSETS AND LIABILITIES', doc.page.margins.left, doc.y, { width: pageWidth(), align:'center' });
    doc.moveDown(0.2);
    doc.font('Times-Italic').fontSize(12).fillColor('#333').text('Section 26 of the Public Officer Ethics Act, No. 4 of 2003', doc.page.margins.left, doc.y, { width: pageWidth(), align:'center' });
    doc.fillColor('#000');
    // Thin rule
    const x = doc.page.margins.left; const w = pageWidth(); const y = doc.y + 8;
    doc.moveTo(x, y).lineTo(x + w, y).stroke('#666');
    doc.y = y + 10;
    // Password note (small, centered)
    const banner = 'If prompted, use your National ID number as the PDF password.';
    doc.font('Times-Italic').fontSize(8).fillColor('#555').text(banner, doc.page.margins.left, doc.y, { width: pageWidth(), align:'center' });
    doc.fillColor('#000');
    doc.y += 10;
  };
  const addPageFooter=()=>{
    // Draw footer page number inside the content area (avoid pushing content or creating blank pages)
    const currentY = doc.y; // remember cursor
    const footerY = doc.page.height - doc.page.margins.bottom - 12; // inside bottom margin
    doc.save();
    doc.font('Times-Roman').fontSize(8).fillColor('#555');
    doc.text(`Page ${pageCounter}`, doc.page.margins.left, footerY, { width: pageWidth(), align:'center' });
    doc.restore();
    doc.y = currentY; // restore cursor to continue content if needed
  };
  const ensureSpace=n=>{ if(doc.y + n > doc.page.height - doc.page.margins.bottom){ addPageFooter(); doc.addPage(); pageCounter++; addPageFooter(); } };
  const section=(t, subtitle=null)=>{ 
    ensureSpace(40); 
    doc.moveDown(0.5); 
    doc.font('Times-Bold').fontSize(12).fillColor('#000').text(t.toUpperCase(), { align:'left' }); 
    if (subtitle) {
      doc.moveDown(0.1);
      doc.font('Times-Italic').fontSize(9).fillColor('#444').text(subtitle, { align:'left' });
      doc.fillColor('#000');
    }
    doc.moveDown(0.2).font('Times-Roman').fontSize(10).fillColor('#000');
  };
  // Generic table renderer (updated padding & spacing)
  const table=(rows,headers, opts={})=>{
    const { emptyMessage='None', columnWidths=null, fontSize=8 } = opts;
    if(!rows.length){ doc.font('Times-Italic').fontSize(fontSize).text(emptyMessage); doc.moveDown(0.4); return; }
    const w=pageWidth();
    const totalCols = headers.length;
    const colWidths = columnWidths && columnWidths.length===totalCols ? columnWidths : headers.map(()=>Math.floor(w/totalCols));
    const startXBase = doc.x;
    const drawRow=(vals,isHeader=false)=>{
      ensureSpace(28);
      const startX = startXBase;
      const rowY = doc.y;
      // measure heights
      const cellHeights = vals.map((val,i)=>{
        const text = (val===undefined||val===null?'':String(val)).substring(0,500);
        return doc.heightOfString(text, { width: colWidths[i]-8, align:'left' });
      });
      const paddingY = isHeader ? 6 : 5;
      const rowHeight = Math.max(...cellHeights) + paddingY*2;
      // background for header / zebra
      if (isHeader) {
        doc.save().rect(startX, rowY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill('#e6eef5').restore();
      } else if (opts.zebra && rows.indexOf(vals) % 2 === 0) {
        doc.save().rect(startX, rowY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill('#fafafa').restore();
      }
      // draw cells
      let offsetX = startX;
      vals.forEach((val,i)=>{
        const cellWidth = colWidths[i];
        doc.rect(offsetX, rowY, cellWidth, rowHeight).stroke('#cccccc');
        doc.font(isHeader?'Times-Bold':'Times-Roman').fontSize(isHeader?fontSize+1:fontSize).fillColor('#000');
        doc.text((val===undefined||val===null?'':String(val)), offsetX+4, rowY+paddingY, { width: cellWidth-8, continued:false });
        offsetX += cellWidth;
      });
      doc.y = rowY + rowHeight; doc.x = startX;
    };
    drawRow(headers,true);
    rows.forEach(r=> drawRow(r,false));
    doc.moveDown(0.7);
  };
  // Helper to build key/value tables uniformly
  const tableKV=(pairs, headerLabel='Field')=>{
    const filtered = (pairs||[]).filter(p=>p && p.length===2);
    table(filtered, [headerLabel,'Value'], { fontSize:9, zebra:true });
  };
  addHeader();
  // --- BEGIN: Custom Numbering and Grouping for First Page ---
  const leftX = doc.page.margins.left;
  let y = doc.y;
  // 1. Name of public officer
  doc.font('Times-Roman').fontSize(16).text('1. Name of public officer', leftX, y);
  y += 30;
  const surname = base.surname || '';
  const firstName = base.first_name || '';
  const otherNames = base.other_names || '';
  doc.fontSize(14).text(surname, leftX, y, { width: 150 });
  doc.moveTo(leftX, y + 18).lineTo(leftX + 150, y + 18).stroke('#999');
  doc.text(firstName, leftX + 180, y, { width: 140 });
  doc.moveTo(leftX + 180, y + 18).lineTo(leftX + 320, y + 18).stroke('#999');
  doc.text(otherNames, leftX + 340, y, { width: 140 });
  doc.moveTo(leftX + 340, y + 18).lineTo(leftX + 480, y + 18).stroke('#999');
  y += 32;
  doc.fontSize(12).text('(Surname)', leftX, y);
  doc.text('(First name)', leftX + 180, y);
  doc.text('(Other names)', leftX + 340, y);
  y += 38;
  // 2. Birth information
  doc.font('Times-Roman').fontSize(16).text('2. Birth information', leftX, y);
  y += 30;
  // a. Date of birth: DD/MM/YY (single field, one underline)
  doc.fontSize(13).text('a. Date of birth:', leftX + 10, y, { continued: true });
  const dobLabelEnd = leftX + 1 + doc.widthOfString('a. Date of birth:');
  const dobValue = fmtDate(base.birthdate);
  doc.text(dobValue, dobLabelEnd + 1, y, { width: 80 });
  doc.moveTo(dobLabelEnd + 10, y + 18).lineTo(dobLabelEnd + 100, y + 18).stroke('#999');
  y += 34;
  // b. Place of birth
  doc.fontSize(13).text('b. Place of birth:', leftX + 10, y);
  doc.text(base.place_of_birth || '', leftX + 100, y, { width: 250 });
  doc.moveTo(leftX + 100, y + 18).lineTo(leftX + 200, y + 18).stroke('#999');
  y += 38;
  // 3. Marital status (answer next to label)
  doc.font('Times-Roman').fontSize(16).text('3. Marital status:', leftX, y, { continued: false });
  doc.fontSize(13).text(base.marital_status || base.user_marital_status || '', leftX + 120, y, { width: 200 });
  doc.moveTo(leftX + 120, y + 18).lineTo(leftX + 200, y + 18).stroke('#999');
  y += 38;
  // 4. Address
  doc.font('Times-Roman').fontSize(16).text('4. Address', leftX, y);
  y += 30;
  // a. Postal address
  doc.fontSize(13).text('a. Postal address:', leftX + 10, y);
  doc.text(base.postal_address || '', leftX + 120, y, { width: 300 });
  doc.moveTo(leftX + 120, y + 18).lineTo(leftX + 210, y + 18).stroke('#999');
  y += 34;
  // b. Physical address
  doc.fontSize(13).text('b. Physical address:', leftX + 10, y);
  doc.text(base.physical_address || '', leftX + 130, y, { width: 300 });
  doc.moveTo(leftX + 130, y + 18).lineTo(leftX + 250, y + 18).stroke('#999');
  y += 38;
  // 5. Employment information
  doc.font('Times-Roman').fontSize(16).text('5. Employment information', leftX, y);
  y += 30;
  // a. Employment No.
  doc.fontSize(13).text('a. Employment No.:', leftX + 10, y);
  doc.text(base.payroll_number || '', leftX + 150, y, { width: 200 });
  doc.moveTo(leftX + 150, y + 18).lineTo(leftX + 250, y + 18).stroke('#999');
  y += 34;
  // b. Designation
  doc.fontSize(13).text('b. Designation:', leftX + 10, y);
  doc.text(base.designation || '', leftX + 100, y, { width: 200 });
  doc.moveTo(leftX + 100, y + 18).lineTo(leftX + 200, y + 18).stroke('#999');
  y += 34;
  // c. Name of Department (full line)
  doc.fontSize(13).text('c. Name of Department:', leftX + 1, y);
  doc.text(base.department || '', leftX + 130, y, { width: 400 });
  doc.moveTo(leftX + 130, y + 18).lineTo(leftX + 550, y + 18).stroke('#999');
  y += 34;
  // d. Nature of employment (full line)
  doc.fontSize(13).text('d. Nature of employment (permanent, temporary, contract, etc.):', leftX + 10, y);
  doc.text(base.nature_of_employment || '', leftX + 350, y, { width: 180 });
  doc.moveTo(leftX + 350, y + 18).lineTo(leftX + 500, y + 18).stroke('#999');
  y += 44;
  doc.y = y;
  // --- END: Custom Numbering and Grouping for First Page ---
  // Page 2: Sections 6 and 7
  addPageFooter(); doc.addPage(); pageCounter++;
  doc.y = doc.page.margins.top;
  let currentY = doc.y;
  // 6. Names of spouse or spouses
  doc.font('Times-Roman').fontSize(16).text('6. Names of spouse or spouses', leftX, currentY);
  currentY += 30;
  for (let i = 0; i < 5; i++) { // assume up to 5 spouses
    const spouse = normalized.spousesArr[i];
    const nameParts = spouse ? spouse.name.split(' ') : ['', '', ''];
    const surname = nameParts[0] || '';
    const firstName = nameParts[1] || '';
    const otherNames = nameParts.slice(2).join(' ') || '';
    doc.fontSize(14).text(surname, leftX, currentY, { width: 150 });
    doc.moveTo(leftX, currentY + 18).lineTo(leftX + 150, currentY + 18).stroke('#999');
    doc.text(firstName, leftX + 180, currentY, { width: 140 });
    doc.moveTo(leftX + 180, currentY + 18).lineTo(leftX + 320, currentY + 18).stroke('#999');
    doc.text(otherNames, leftX + 340, currentY, { width: 140 });
    doc.moveTo(leftX + 340, currentY + 18).lineTo(leftX + 480, currentY + 18).stroke('#999');
    currentY += 32;
  }
  doc.fontSize(12).text('(Surname)', leftX, currentY);
  doc.text('(First name)', leftX + 180, currentY);
  doc.text('(Other names)', leftX + 340, currentY);
  currentY += 38;
  // 7. Names of dependent children under the age of 18 years.
  doc.font('Times-Roman').fontSize(16).text('7. Names of dependent children under the age of 18 years.', leftX, currentY);
  currentY += 30;
  for (let i = 0; i < 5; i++) { // assume up to 5 children
    const child = normalized.childrenArr[i];
    const nameParts = child ? child.name.split(' ') : ['', '', ''];
    const surname = nameParts[0] || '';
    const firstName = nameParts[1] || '';
    const otherNames = nameParts.slice(2).join(' ') || '';
    doc.fontSize(14).text(surname, leftX, currentY, { width: 150 });
    doc.moveTo(leftX, currentY + 18).lineTo(leftX + 150, currentY + 18).stroke('#999');
    doc.text(firstName, leftX + 180, currentY, { width: 140 });
    doc.moveTo(leftX + 180, currentY + 18).lineTo(leftX + 320, currentY + 18).stroke('#999');
    doc.text(otherNames, leftX + 340, currentY, { width: 140 });
    doc.moveTo(leftX + 340, currentY + 18).lineTo(leftX + 480, currentY + 18).stroke('#999');
    currentY += 32;
  }
  doc.fontSize(12).text('(Surname)', leftX, currentY);
  doc.text('(First name)', leftX + 180, currentY);
  doc.text('(Other names)', leftX + 340, currentY);
  currentY += 38;
  doc.y = currentY;
  // Page 3+: Sections 8 for each member
  addPageFooter(); doc.addPage(); pageCounter++; addPageFooter();
  doc.y = doc.page.margins.top;

  // Integrate root financial data into the Financial Declaration list (single synthetic user entry)
  const userDisplayName = [base.surname, base.first_name, base.other_names].filter(Boolean).join(' ').trim() || 'User';
  if ((normalized.rootIncome && normalized.rootIncome.length) || (normalized.rootAssets && normalized.rootAssets.length) || (normalized.rootLiabilities && normalized.rootLiabilities.length)) {
    normalized.finDeclExpanded.unshift({
      member_type: 'user',
      member_name: userDisplayName,
      declaration_date: base.declaration_date || new Date().toISOString().slice(0,10),
      period_start_date: base.period_start_date || '',
      period_end_date: base.period_end_date || '',
      incomes: [...(normalized.rootIncome||[])],
      assets: [...(normalized.rootAssets||[])],
      liabilities: [...(normalized.rootLiabilities||[])]
    });
  }
  const userFDs = normalized.finDeclExpanded.filter(fd => (fd.member_type||'').toLowerCase() === 'user');
  if (userFDs.length > 1) {
    const primary = userFDs[0];
    const uniqMerge = (target, add) => {
      const seen = new Set(target.map(o=>JSON.stringify(o)));
      add.forEach(o=>{ const s=JSON.stringify(o); if(!seen.has(s)){ seen.add(s); target.push(o);} });
    };
    for (let i=1;i<userFDs.length;i++) {
      uniqMerge(primary.incomes, userFDs[i].incomes||[]);
      uniqMerge(primary.assets, userFDs[i].assets||[]);
      uniqMerge(primary.liabilities, userFDs[i].liabilities||[]);
    }
    // Rebuild expanded list with single consolidated user entry at the front
    normalized.finDeclExpanded = [primary, ...normalized.finDeclExpanded.filter(fd => (fd.member_type||'').toLowerCase() !== 'user')];
  }
  // PART B: Financial Declaration per member (matching form sections)
  normalized.finDeclExpanded.forEach(fd=>{
    section(`8. Financial statement for: ${fd.member_type.toUpperCase()} (${fd.member_name})`);
    doc.font('Times-Roman').fontSize(10).text(`a. Statement date: ${fmtDate(fd.declaration_date)||''}`);
    doc.moveDown(0.2);
    doc.font('Times-Roman').fontSize(10).text(`b. Income, including emoluments, for period from ${fmtDate(fd.period_start_date||'')} to ${fmtDate(fd.period_end_date||'')}`);
    doc.moveDown(0.2);
    doc.font('Times-Bold').fontSize(10).text('Income', { underline:false }).moveDown(0.15);
    table((fd.incomes||[]).map(i=>[`${i.type}: ${i.description}`, formatMoney(i.value)]), ['Description','Approximate amount'], { zebra:true, fontSize:9 });
    doc.font('Times-Bold').fontSize(10).text('Assets').moveDown(0.15);
    table((fd.assets||[]).map(a=>[buildAssetDescription(a), formatMoney(a.value)]), ['Description (include location of asset where applicable)', 'Approximate value'], { zebra:true, fontSize:9 });
    doc.font('Times-Bold').fontSize(10).text('Liabilities').moveDown(0.15);
    table((fd.liabilities||[]).map(l=>[buildLiabilityDescription(l), formatMoney(l.value)]), ['Description','Approximate amount'], { zebra:true, fontSize:9 });
  });

  // PART C: Spouse and Children (summary tables similar to user financial data tables)
  if (normalized.spousesArr.length) {
    normalized.spousesArr.forEach((s,i)=>{
      section(`Part C: Spouse ${i+1} – ${s.name||'Unnamed'}`);
      doc.font('Times-Bold').fontSize(10).text('Income').moveDown(0.1);
      table(s.incomes.map(i=>[`${i.type}: ${i.description}`, formatMoney(i.value)]), ['Description','Approximate amount'], { zebra:true, fontSize:9 });
      doc.font('Times-Bold').fontSize(10).text('Assets').moveDown(0.1);
      table(s.assets.map(a=>[buildAssetDescription(a), formatMoney(a.value)]), ['Description (include location of asset where applicable)', 'Approximate value'], { zebra:true, fontSize:9 });
      doc.font('Times-Bold').fontSize(10).text('Liabilities').moveDown(0.1);
      table(s.liabilities.map(l=>[buildLiabilityDescription(l), formatMoney(l.value)]), ['Description','Approximate amount'], { zebra:true, fontSize:9 });
    });
  }
  if (normalized.childrenArr.length) {
    normalized.childrenArr.forEach((c,i)=>{
      section(`Part D: Child ${i+1} – ${c.name||'Unnamed'}`);
      doc.font('Times-Bold').fontSize(10).text('Income').moveDown(0.1);
      table(c.incomes.map(i=>[`${i.type}: ${i.description}`, formatMoney(i.value)]), ['Description','Approximate amount'], { zebra:true, fontSize:9 });
      doc.font('Times-Bold').fontSize(10).text('Assets').moveDown(0.1);
      table(c.assets.map(a=>[buildAssetDescription(a), formatMoney(a.value)]), ['Description (include location of asset where applicable)', 'Approximate value'], { zebra:true, fontSize:9 });
      doc.font('Times-Bold').fontSize(10).text('Liabilities').moveDown(0.1);
      table(c.liabilities.map(l=>[buildLiabilityDescription(l), formatMoney(l.value)]), ['Description','Approximate amount'], { zebra:true, fontSize:9 });
    });
  }



  // Declaration & Signature lines similar to the form
  const declarationDate = fmtDate(base.declaration_date || normalized.finDeclExpanded.find(fd => (fd.member_type||'').toLowerCase()==='user')?.declaration_date || normalized.finDeclExpanded[0]?.declaration_date || '');
  addPageFooter(); doc.addPage(); pageCounter++; addPageFooter();
  doc.y = doc.page.margins.top;
  section('Declaration and Signature');
  const declarationText = 'I hereby declare that the information given herein is to the best of my knowledge true and complete.';
  doc.font('Times-Roman').fontSize(12).text(declarationText);
  doc.moveDown(0.6);
  const line = (label, val='')=>{
    ensureSpace(22);
    const sx = doc.x; const y = doc.y;
    doc.font('Times-Roman').fontSize(12).text(label, { continued:true });
    const lw = doc.widthOfString(label) + 6; const start = sx + lw; const end = doc.page.margins.left + pageWidth() / 2;
    doc.text(val || ' ', start, y, { width: end - start, continued:false });
    const uy = y + doc.currentLineHeight() - 2; doc.moveTo(start, uy).lineTo(end, uy).stroke('#999');
    doc.y = y + doc.currentLineHeight() + 15;
  };
  line('Signature of Declarant:', 'Signed');
  line('Date: ', declarationDate || '');
  if (base.witness_name || base.witness_phone || base.witness_address) {
    doc.moveDown(0.2);
    doc.font('Times-Bold').fontSize(10).text('Witness Details');
    line('Witness Name: ', base.witness_name||'');
    line('Witness Phone: ', base.witness_phone||'');
    line('Witness Address: ', base.witness_address||'');
  }

  // Official use block (admin acknowledgement)
  ensureSpace(60);
  doc.moveDown(0.2);
  doc.font('Times-Italic').fontSize(9).fillColor('#444').text('For Official Use:', { align:'left' });
  doc.fillColor('#000');
  line('Received/Reviewed by (Admin): ', base.approved_admin_name || '');
  line('Admin Action Date: ', base.approved_at ? fmtDate(base.approved_at) : '');

  ensureSpace(1); doc.moveDown(0.5).font('Times-Italic').fontSize(8).fillColor('#555').text('Generated by Mombasa County DAILs Portal.', { align:'center', width: pageWidth() });
  addPageFooter();
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
  // Provide a user-facing instruction so the UI / caller can notify the user which password to use.
  // NOTE: The password prompt appears before the PDF contents are visible, so this must be surfaced
  // externally (e.g. via API response metadata or a toast) — embedding inside the PDF alone is not
  // sufficient. We therefore return a clear message when encryption is active.
  const passwordInstruction = applied
    ? 'This PDF is password protected. Use your National ID number as the password.'
    : null;
  return { buffer, base: full.base, password, encryptionApplied: applied, passwordInstruction };
}

module.exports = { generateDeclarationPDF };