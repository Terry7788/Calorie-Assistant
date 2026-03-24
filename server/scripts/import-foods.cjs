const fs = require('fs');

// Read CSV file
const csvContent = fs.readFileSync('../Food Database fdf19bfc70a44dbb914cfd964e365e55.csv', 'utf8');
const lines = csvContent.split('\n').slice(1); // Skip header

const foods = [];
for (const line of lines) {
  if (!line.trim()) continue;
  
  // Simple CSV parsing - handle quotes
  const parts = [];
  let current = '';
  let inQuotes = false;
  
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  
  if (parts.length >= 3) {
    const name = parts[0].replace(/^"|"$/g, '');
    const amount = parseFloat(parts[1]) || 1;
    const calories = parseFloat(parts[2]) || 0;
    const protein = parts[3] ? parseFloat(parts[3]) : null;
    
    if (name && calories > 0) {
      // Determine base unit - if amount is 1 it's likely "servings", otherwise "grams"
      const baseUnit = amount === 1 ? 'servings' : 'grams';
      
      // If amount > 1 and not a typical serving size, use as grams
      const baseAmount = amount;
      
      foods.push({ name, baseAmount, baseUnit, calories, protein });
    }
  }
}

console.log(`Parsed ${foods.length} foods`);

// Now start the server and import
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./calorie_assistant.db');

// Insert foods
let inserted = 0;
let skipped = 0;

function insertNext(index) {
  if (index >= foods.length) {
    console.log(`Done! Inserted ${inserted} foods, skipped ${skipped} duplicates`);
    db.close();
    return;
  }
  
  const food = foods[index];
  
  // Check if exists
  db.get('SELECT id FROM Foods WHERE name = ?', [food.name], (err, row) => {
    if (row) {
      skipped++;
      insertNext(index + 1);
      return;
    }
    
    db.run(
      'INSERT INTO Foods (name, base_amount, base_unit, calories, protein) VALUES (?, ?, ?, ?, ?)',
      [food.name, food.baseAmount, food.baseUnit, food.calories, food.protein],
      function(err) {
        if (err) {
          console.error('Error inserting', food.name, err.message);
        } else {
          inserted++;
        }
        insertNext(index + 1);
      }
    );
  });
}

insertNext(0);