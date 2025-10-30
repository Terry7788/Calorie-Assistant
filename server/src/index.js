import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const app = express();
const PORT = 4000;

app.use(express.json());

const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no-origin (like curl) and exact match to configured origin
      if (!origin || origin === allowedOrigin) return callback(null, true);
      // Allow Vercel preview/production domains if FRONTEND_ORIGIN includes vercel.app
      if (allowedOrigin.includes('vercel.app') && /\.vercel\.app$/.test(new URL(origin).hostname)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: false,
  })
);

let db;

async function initDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database('./calorie_assistant.db', (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Create Foods table
      db.run(`
        CREATE TABLE IF NOT EXISTS Foods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          base_amount REAL NOT NULL,
          base_unit TEXT NOT NULL,
          calories REAL NOT NULL,
          protein REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });
}

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// List foods with optional search
app.get('/api/foods', async (req, res) => {
  try {
    const search = (req.query.search || '').toString().trim();
    let query = 'SELECT id, name, base_amount as baseAmount, base_unit as baseUnit, calories, protein FROM Foods';
    const params = [];

    if (search) {
      query += ' WHERE name LIKE ?';
      params.push(`%${search}%`);
    }
    query += ' ORDER BY name ASC';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('GET /api/foods error', err);
        res.status(500).json({ error: 'Failed to fetch foods' });
        return;
      }
      res.json(rows || []);
    });
  } catch (err) {
    console.error('GET /api/foods error', err);
    res.status(500).json({ error: 'Failed to fetch foods' });
  }
});

// Create food
app.post('/api/foods', async (req, res) => {
  try {
    const { name, baseAmount, baseUnit, calories, protein } = req.body || {};
    if (!name || !baseAmount || !baseUnit || !calories) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const baseAmountNum = toNumber(baseAmount);
    const caloriesNum = toNumber(calories);
    const proteinNum = toNumber(protein, null);

    if (!baseAmountNum || !caloriesNum) {
      return res.status(400).json({ error: 'Invalid numeric values' });
    }

    db.run(
      'INSERT INTO Foods (name, base_amount, base_unit, calories, protein) VALUES (?, ?, ?, ?, ?)',
      [name, baseAmountNum, baseUnit, caloriesNum, proteinNum],
      function(err) {
        if (err) {
          console.error('POST /api/foods error', err);
          res.status(500).json({ error: 'Failed to create food' });
          return;
        }
        
        // Return the created food
        db.get(
          'SELECT id, name, base_amount as baseAmount, base_unit as baseUnit, calories, protein FROM Foods WHERE id = ?',
          [this.lastID],
          (err, row) => {
            if (err) {
              console.error('Error fetching created food', err);
              res.status(500).json({ error: 'Failed to fetch created food' });
              return;
            }
            res.status(201).json(row);
          }
        );
      }
    );
  } catch (err) {
    console.error('POST /api/foods error', err);
    res.status(500).json({ error: 'Failed to create food' });
  }
});

// Update food
app.put('/api/foods/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const { name, baseAmount, baseUnit, calories, protein } = req.body || {};

    // Build dynamic update
    const fields = [];
    const params = [];

    if (name !== undefined) {
      fields.push('name = ?');
      params.push(name);
    }
    if (baseAmount !== undefined) {
      const v = toNumber(baseAmount);
      if (v === null) return res.status(400).json({ error: 'Invalid baseAmount' });
      fields.push('base_amount = ?');
      params.push(v);
    }
    if (baseUnit !== undefined) {
      fields.push('base_unit = ?');
      params.push(baseUnit);
    }
    if (calories !== undefined) {
      const v = toNumber(calories);
      if (v === null) return res.status(400).json({ error: 'Invalid calories' });
      fields.push('calories = ?');
      params.push(v);
    }
    if (protein !== undefined) {
      const v = toNumber(protein, null);
      if (v === null && protein !== null) return res.status(400).json({ error: 'Invalid protein' });
      fields.push('protein = ?');
      params.push(v);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);

    db.run(
      `UPDATE Foods SET ${fields.join(', ')} WHERE id = ?`,
      params,
      function(err) {
        if (err) {
          console.error('PUT /api/foods/:id error', err);
          res.status(500).json({ error: 'Failed to update food' });
          return;
        }
        
        if (this.changes === 0) {
          res.status(404).json({ error: 'Not found' });
          return;
        }

        // Return updated food
        db.get(
          'SELECT id, name, base_amount as baseAmount, base_unit as baseUnit, calories, protein FROM Foods WHERE id = ?',
          [id],
          (err, row) => {
            if (err) {
              console.error('Error fetching updated food', err);
              res.status(500).json({ error: 'Failed to fetch updated food' });
              return;
            }
            res.json(row);
          }
        );
      }
    );
  } catch (err) {
    console.error('PUT /api/foods/:id error', err);
    res.status(500).json({ error: 'Failed to update food' });
  }
});

// Delete food
app.delete('/api/foods/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    
    db.run('DELETE FROM Foods WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('DELETE /api/foods/:id error', err);
        res.status(500).json({ error: 'Failed to delete food' });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      
      res.status(204).send();
    });
  } catch (err) {
    console.error('DELETE /api/foods/:id error', err);
    res.status(500).json({ error: 'Failed to delete food' });
  }
});

app.listen(PORT, async () => {
  try {
    await initDatabase();
    console.log(`Server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error('Failed to start server', err);
  }
});


