/*
  Usage:
    powershell>
      cd server
      npm run import:csv
    - or -
      node scripts/import_csv.js "../Food Database fdf19bfc70a44dbb914cfd964e365e55_all.csv" "../Food Database fdf19bfc70a44dbb914cfd964e365e55.csv"

  Notes:
  - Maps CSV columns: Name, Amount, Calories, Protein -> Foods(name, base_amount, base_unit, calories, protein)
  - base_unit defaults to 'servings'
*/

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

const ROOT = path.resolve(path.join(process.cwd(), '..'));

const DEFAULT_FILES = [
  path.join(ROOT, 'Food Database fdf19bfc70a44dbb914cfd964e365e55_all.csv'),
  path.join(ROOT, 'Food Database fdf19bfc70a44dbb914cfd964e365e55.csv'),
];

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  // Expect header: Name,Amount,Calories,Protein
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Basic CSV parse handling quoted commas
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        // Toggle quotes or escape double-quote inside quotes
        if (inQuotes && line[c + 1] === '"') {
          current += '"';
          c++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cols.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current);

    // Normalize to at least 4 columns
    while (cols.length < 4) cols.push('');

    rows.push(cols.map(s => s.trim()));
  }
  return rows;
}

function toNumber(value) {
  if (value == null) return null;
  const t = String(value).trim();
  if (t === '' || t === 'null' || t === 'undefined') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

async function ensureDb(db) {
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS Foods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        base_amount REAL NOT NULL,
        base_unit TEXT NOT NULL,
        calories REAL NOT NULL,
        protein REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });
  // Optional: speed up bulk import
  await exec(db, 'PRAGMA synchronous = OFF;');
  await exec(db, 'PRAGMA journal_mode = MEMORY;');
}

function exec(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function upsertFood(db, { name, baseAmount, baseUnit, calories, protein }) {
  const existing = await get(db, 'SELECT id FROM Foods WHERE name = ?', [name]);
  if (existing?.id) {
    await exec(
      db,
      'UPDATE Foods SET base_amount = ?, base_unit = ?, calories = ?, protein = ? WHERE id = ?',
      [baseAmount, baseUnit, calories, protein, existing.id]
    );
    return { action: 'update', id: existing.id };
  }
  const res = await exec(
    db,
    'INSERT INTO Foods (name, base_amount, base_unit, calories, protein) VALUES (?, ?, ?, ?, ?)',
    [name, baseAmount, baseUnit, calories, protein]
  );
  return { action: 'insert', id: res.lastID };
}

async function importFiles(files) {
  const db = new sqlite3.Database(path.resolve('./calorie_assistant.db'));
  await ensureDb(db);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) {
      console.warn(`Skip missing file: ${abs}`);
      continue;
    }
    const content = fs.readFileSync(abs, 'utf8');
    const rows = parseCsv(content);
    for (const cols of rows) {
      const [nameRaw, amountRaw, caloriesRaw, proteinRaw] = cols;
      const name = (nameRaw || '').trim();
      const baseAmount = toNumber(amountRaw) ?? 1;
      const baseUnit = 'servings';
      const calories = toNumber(caloriesRaw);
      const protein = toNumber(proteinRaw);

      if (!name || calories == null) {
        skipped++;
        continue;
      }

      const res = await upsertFood(db, { name, baseAmount, baseUnit, calories, protein });
      if (res.action === 'insert') inserted++; else updated++;
    }
  }

  console.log(`Done. Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);
  db.close();
}

const argFiles = process.argv.slice(2);
const filesToImport = argFiles.length ? argFiles : DEFAULT_FILES;

importFiles(filesToImport).catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});


