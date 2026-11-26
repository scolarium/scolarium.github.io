// Выгрузка таблиц в Excel (ExcelJS) и PDF (pdfmake). Библиотеки подгружаются только при первой выгрузке.
// Ячейка: значение или объект {v, fill, color, bold, align}; цвета — 6 символов HEX без «#».
const Exp = (() => {
  const LIBS = {
    xlsx: ["https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"],
    pdf: ["https://cdn.jsdelivr.net/npm/pdfmake@0.2.12/build/pdfmake.min.js", "https://cdn.jsdelivr.net/npm/pdfmake@0.2.12/build/vfs_fonts.js"]
  };
  const cache = {};
  const loadScript = url => cache[url] ??= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = url; s.onload = () => res();
    s.onerror = () => { delete cache[url]; s.remove(); rej(new Error("Не удалось загрузить библиотеку для выгрузки. Проверьте интернет и повторите.")); };
    document.head.append(s);
  });
  const need = async kind => { for (const u of LIBS[kind]) await loadScript(u); };   // pdfmake — строго до vfs_fonts

  const norm = c => (c !== null && typeof c === "object") ? c : {v: c};
  const safeFile = s => String(s).replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "export";
  const save = (blob, name) => {
    const a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const uniq = (raw, used) => {
    const base = String(raw).replace(/[\\/?*\[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Лист";
    let n = base, i = 2; while (used.has(n.toLowerCase())) { const suf = " (" + i++ + ")"; n = base.slice(0, 31 - suf.length) + suf; }
    used.add(n.toLowerCase()); return n;
  };

  // ───── Excel ─────
  // sheet: {name, title, lines:[текст], head:[...], rows:[[cell]], widths:[число], leftCols, freezeCols, headHeight}
  async function xlsx({file, sheets}){
    await need("xlsx");
    const wb = new ExcelJS.Workbook(); wb.creator = "Școlarium"; wb.created = new Date();
    const used = new Set(), line = {style:"thin", color:{argb:"FFD3DDEE"}}, BORDER = {top:line, left:line, bottom:line, right:line};
    for (const sh of sheets){
      const ncol = Math.max(sh.head.length, 2), left = sh.leftCols ?? 1;
      const ws = wb.addWorksheet(uniq(sh.name, used), {pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0}});
      let r = 1;
      if (sh.title){ const c = ws.getCell(r, 1); c.value = sh.title; c.font = {bold:true, size:14, color:{argb:"FF233F8F"}}; ws.mergeCells(r, 1, r, ncol); ws.getRow(r).height = 24; r++; }
      for (const t of (sh.lines || [])){ const c = ws.getCell(r, 1); c.value = t; c.font = {size:10, color:{argb:"FF56637D"}}; ws.mergeCells(r, 1, r, ncol); r++; }
      if (sh.title || (sh.lines && sh.lines.length)) r++;
      const hr = ws.getRow(r);
      sh.head.forEach((t, i) => { const c = hr.getCell(i + 1); c.value = t;
        c.font = {bold:true, size:10, color:{argb:"FFFFFFFF"}}; c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF233F8F"}};
        c.alignment = {horizontal:i < left ? "left" : "center", vertical:"middle", wrapText:true}; c.border = BORDER; });
      hr.height = sh.headHeight || 34;
      const headRow = r;
      sh.rows.forEach((row, ri) => { const er = ws.getRow(headRow + 1 + ri);
        row.forEach((raw, i) => { const o = norm(raw), c = er.getCell(i + 1);
          c.value = o.v ?? "";
          c.font = {size:10, bold:!!o.bold, ...(o.color ? {color:{argb:"FF" + o.color}} : {})};
          const fill = o.fill || (ri % 2 ? "F5F8FD" : null);
          if (fill) c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF" + fill}};
          c.alignment = {horizontal:o.align || (i < left ? "left" : "center"), vertical:"middle", wrapText:true};
          c.border = BORDER; }); });
      (sh.widths || []).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{state:"frozen", xSplit:sh.freezeCols || 0, ySplit:headRow}];
    }
    const buf = await wb.xlsx.writeBuffer();
    save(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), safeFile(file) + ".xlsx");
  }

  // ───── PDF ─────
  const LAYOUT = {hLineWidth:() => .5, vLineWidth:() => .5, hLineColor:() => "#CDD8EA", vLineColor:() => "#CDD8EA",
    paddingLeft:() => 3, paddingRight:() => 3, paddingTop:() => 2.5, paddingBottom:() => 2.5};
  const h1 = t => ({text:t, fontSize:15, bold:true, color:"#233F8F", margin:[0, 0, 0, 2]});
  const h2 = (t, extra = {}) => ({text:t, fontSize:11, bold:true, color:"#18243F", margin:[0, 12, 0, 5], ...extra});
  const p = (t, extra = {}) => ({text:t, fontSize:8.5, color:"#56637D", ...extra});
  const tcell = (raw, i, left, fs, zebra) => { const o = norm(raw), n = {text:String(o.v ?? ""), fontSize:fs, alignment:o.align || (i < left ? "left" : "center")};
    if (o.bold) n.bold = true; if (o.color) n.color = "#" + o.color;
    const fill = o.fill || (zebra ? "F5F8FD" : null); if (fill) n.fillColor = "#" + fill; return n; };
  // table: {head, rows, widths, leftCols, fontSize, headSize}
  function table({head, rows, widths, leftCols = 1, fontSize = 8, headSize}){
    const hs = headSize || fontSize;
    const body = [head.map((t, i) => ({text:String(t), bold:true, color:"#FFFFFF", fillColor:"#233F8F", fontSize:hs, alignment:i < leftCols ? "left" : "center"}))];
    rows.forEach((row, ri) => body.push(row.map((c, i) => tcell(c, i, leftCols, fontSize, ri % 2))));
    return {table:{headerRows:1, dontBreakRows:true, widths, body}, layout:LAYOUT};
  }
  async function pdf({file, landscape = true, content}){
    await need("pdf");
    const dd = {pageSize:"A4", pageOrientation:landscape ? "landscape" : "portrait", pageMargins:[28, 34, 28, 40],
      defaultStyle:{font:"Roboto", fontSize:9, color:"#18243F"}, content,
      footer:(cur, total) => ({columns:[{text:"Scolarium", color:"#8A96AD", fontSize:7, margin:[28, 0, 0, 0]}, {text:cur + " / " + total, alignment:"right", color:"#8A96AD", fontSize:7, margin:[0, 0, 28, 0]}]})};
    await new Promise((res, rej) => { try { pdfMake.createPdf(dd).getBlob(b => { save(b, safeFile(file) + ".pdf"); res(); }); } catch (e) { rej(e); } });
  }
  return {xlsx, pdf, table, h1, h2, p, safeFile, save};
})();
