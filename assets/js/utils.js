export function money(n) {
  return Number(n || 0).toFixed(2).replace(/\.00$/, "");
}

export function isUrl(v) {
  return /^https?:\/\//i.test(String(v || "").trim());
}

export function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[ch]));
}

export function parseCSV(text) {
  const rows = [];
  let row = [], value = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') {
      if (inQuotes && n === '"') { value += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      row.push(value); value = "";
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && n === '\n') i++;
      row.push(value); value = "";
      if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
      row = [];
    } else {
      value += c;
    }
  }
  row.push(value);
  if (row.some(cell => String(cell).trim() !== "")) rows.push(row);
  return rows;
}
