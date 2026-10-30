// Minimal, correct CSV parse/serialize (RFC-4180 style quoting) for the batch
// upload path. No silent coercion — invalid rows are reported with reasons.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  errors: string[];
}

export function parseCsv(text: string): ParsedCsv {
  const errors: string[] = [];
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const pushRow = () => {
    // skip fully-empty trailing row
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    pushRow();
  }
  if (inQuotes) errors.push("Unclosed quoted field detected.");
  if (rows.length === 0) return { headers: [], rows: [], errors: [...errors, "File is empty."] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return { headers, rows: rows.slice(1), errors };
}

export function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(r.map((v) => csvEscape(v == null ? "" : String(v))).join(","));
  return lines.join("\n") + "\n";
}
