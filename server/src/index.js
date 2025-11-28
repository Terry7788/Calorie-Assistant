import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: false,
  },
});
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
    const dbPath = process.env.DATABASE_PATH || './calorie_assistant.db';
    db = new sqlite3.Database(dbPath, (err) => {
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
        
        // Create SavedMeals table
        db.run(`
          CREATE TABLE IF NOT EXISTS SavedMeals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Create SavedMealItems table
          db.run(`
            CREATE TABLE IF NOT EXISTS SavedMealItems (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              meal_id INTEGER NOT NULL,
              food_id INTEGER NOT NULL,
              servings REAL NOT NULL,
              FOREIGN KEY (meal_id) REFERENCES SavedMeals(id) ON DELETE CASCADE,
              FOREIGN KEY (food_id) REFERENCES Foods(id) ON DELETE CASCADE
            )
          `, (err) => {
            if (err) {
              reject(err);
              return;
            }
            
            // Create CurrentMeal table (single row)
            db.run(`
              CREATE TABLE IF NOT EXISTS CurrentMeal (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `, (err) => {
              if (err) {
                reject(err);
                return;
              }
              
              // Initialize CurrentMeal if it doesn't exist
              db.run(`
                INSERT OR IGNORE INTO CurrentMeal (id) VALUES (1)
              `, (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                // Create CurrentMealItems table
                db.run(`
                  CREATE TABLE IF NOT EXISTS CurrentMealItems (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    food_id INTEGER NOT NULL,
                    servings REAL NOT NULL,
                    FOREIGN KEY (food_id) REFERENCES Foods(id) ON DELETE CASCADE
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
          });
        });
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
            // Broadcast food created event
            io.emit('food-created', row);
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
            // Broadcast food updated event
            io.emit('food-updated', row);
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
      
      // Broadcast food deleted event
      io.emit('food-deleted', { id });
      res.status(204).send();
    });
  } catch (err) {
    console.error('DELETE /api/foods/:id error', err);
    res.status(500).json({ error: 'Failed to delete food' });
  }
});

// Saved Meals Routes

// List saved meals with optional search
app.get('/api/saved-meals', async (req, res) => {
  try {
    const search = (req.query.search || '').toString().trim();
    let query = `
      SELECT 
        sm.id,
        sm.name,
        sm.created_at as createdAt,
        COUNT(smi.id) as itemCount,
        SUM(f.calories * smi.servings) as totalCalories,
        SUM(COALESCE(f.protein, 0) * smi.servings) as totalProtein
      FROM SavedMeals sm
      LEFT JOIN SavedMealItems smi ON sm.id = smi.meal_id
      LEFT JOIN Foods f ON smi.food_id = f.id
    `;
    const params = [];

    if (search) {
      query += ' WHERE sm.name LIKE ?';
      params.push(`%${search}%`);
    }
    
    query += ' GROUP BY sm.id, sm.name, sm.created_at ORDER BY sm.created_at DESC';

    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('GET /api/saved-meals error', err);
        res.status(500).json({ error: 'Failed to fetch saved meals' });
        return;
      }
      res.json(rows || []);
    });
  } catch (err) {
    console.error('GET /api/saved-meals error', err);
    res.status(500).json({ error: 'Failed to fetch saved meals' });
  }
});

// Get saved meal by id with items
app.get('/api/saved-meals/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    // Get meal
    db.get(
      'SELECT id, name, created_at as createdAt FROM SavedMeals WHERE id = ?',
      [id],
      (err, meal) => {
        if (err) {
          console.error('GET /api/saved-meals/:id error', err);
          res.status(500).json({ error: 'Failed to fetch meal' });
          return;
        }
        
        if (!meal) {
          res.status(404).json({ error: 'Not found' });
          return;
        }

        // Get meal items
        db.all(
          `SELECT 
            smi.id,
            smi.food_id as foodId,
            smi.servings,
            f.name,
            f.base_amount as baseAmount,
            f.base_unit as baseUnit,
            f.calories,
            f.protein
          FROM SavedMealItems smi
          JOIN Foods f ON smi.food_id = f.id
          WHERE smi.meal_id = ?`,
          [id],
          (err, items) => {
            if (err) {
              console.error('GET /api/saved-meals/:id items error', err);
              res.status(500).json({ error: 'Failed to fetch meal items' });
              return;
            }
            
            res.json({
              ...meal,
              items: items || []
            });
          }
        );
      }
    );
  } catch (err) {
    console.error('GET /api/saved-meals/:id error', err);
    res.status(500).json({ error: 'Failed to fetch saved meal' });
  }
});

// Create saved meal
app.post('/api/saved-meals', async (req, res) => {
  try {
    const { name, items } = req.body || {};
    
    if (!name || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: name and items' });
    }

    // Create meal
    db.run(
      'INSERT INTO SavedMeals (name) VALUES (?)',
      [name],
      function(err) {
        if (err) {
          console.error('POST /api/saved-meals error', err);
          res.status(500).json({ error: 'Failed to create meal' });
          return;
        }
        
        const mealId = this.lastID;
        
        // Insert meal items
        const placeholders = items.map(() => '(?, ?, ?)').join(', ');
        const values = items.flatMap(item => [mealId, item.foodId, item.servings]);
        
        db.run(
          `INSERT INTO SavedMealItems (meal_id, food_id, servings) VALUES ${placeholders}`,
          values,
          (err) => {
            if (err) {
              console.error('POST /api/saved-meals items error', err);
              // Rollback meal creation
              db.run('DELETE FROM SavedMeals WHERE id = ?', [mealId]);
              res.status(500).json({ error: 'Failed to create meal items' });
              return;
            }
            
            // Return created meal
            db.get(
              `SELECT 
                sm.id,
                sm.name,
                sm.created_at as createdAt
              FROM SavedMeals sm
              WHERE sm.id = ?`,
              [mealId],
              (err, meal) => {
                if (err) {
                  console.error('Error fetching created meal', err);
                  res.status(500).json({ error: 'Failed to fetch created meal' });
                  return;
                }
                res.status(201).json(meal);
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.error('POST /api/saved-meals error', err);
    res.status(500).json({ error: 'Failed to create saved meal' });
  }
});

// Delete saved meal
app.delete('/api/saved-meals/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    
    db.run('DELETE FROM SavedMeals WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('DELETE /api/saved-meals/:id error', err);
        res.status(500).json({ error: 'Failed to delete meal' });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      
      res.status(204).send();
    });
  } catch (err) {
    console.error('DELETE /api/saved-meals/:id error', err);
    res.status(500).json({ error: 'Failed to delete saved meal' });
  }
});

// Current Meal Routes

// Get current meal
app.get('/api/current-meal', async (req, res) => {
  try {
    db.all(
      `SELECT 
        cmi.id,
        cmi.food_id as foodId,
        cmi.servings,
        f.name,
        f.base_amount as baseAmount,
        f.base_unit as baseUnit,
        f.calories,
        f.protein
      FROM CurrentMealItems cmi
      JOIN Foods f ON cmi.food_id = f.id
      ORDER BY cmi.id ASC`,
      [],
      (err, items) => {
        if (err) {
          console.error('GET /api/current-meal error', err);
          res.status(500).json({ error: 'Failed to fetch current meal' });
          return;
        }
        res.json(items || []);
      }
    );
  } catch (err) {
    console.error('GET /api/current-meal error', err);
    res.status(500).json({ error: 'Failed to fetch current meal' });
  }
});

// Add item to current meal
app.post('/api/current-meal/items', async (req, res) => {
  try {
    const { foodId, servings } = req.body || {};
    if (!foodId || servings === undefined) {
      return res.status(400).json({ error: 'Missing required fields: foodId and servings' });
    }

    const foodIdNum = Number(foodId);
    const servingsNum = toNumber(servings);
    if (!Number.isInteger(foodIdNum) || !servingsNum || servingsNum <= 0) {
      return res.status(400).json({ error: 'Invalid foodId or servings' });
    }

    // Check if food exists
    db.get('SELECT id FROM Foods WHERE id = ?', [foodIdNum], (err, food) => {
      if (err || !food) {
        return res.status(404).json({ error: 'Food not found' });
      }

      // Check if item already exists
      db.get(
        'SELECT id FROM CurrentMealItems WHERE food_id = ?',
        [foodIdNum],
        (err, existing) => {
          if (err) {
            console.error('POST /api/current-meal/items error', err);
            return res.status(500).json({ error: 'Failed to check existing item' });
          }

          if (existing) {
            // Update existing item
            db.run(
              'UPDATE CurrentMealItems SET servings = ? WHERE food_id = ?',
              [servingsNum, foodIdNum],
              function(err) {
                if (err) {
                  console.error('POST /api/current-meal/items update error', err);
                  return res.status(500).json({ error: 'Failed to update item' });
                }
                updateCurrentMealTimestamp();
                broadcastMealUpdate();
                res.json({ id: existing.id, foodId: foodIdNum, servings: servingsNum });
              }
            );
          } else {
            // Insert new item
            db.run(
              'INSERT INTO CurrentMealItems (food_id, servings) VALUES (?, ?)',
              [foodIdNum, servingsNum],
              function(err) {
                if (err) {
                  console.error('POST /api/current-meal/items insert error', err);
                  return res.status(500).json({ error: 'Failed to add item' });
                }
                updateCurrentMealTimestamp();
                broadcastMealUpdate();
                res.status(201).json({ id: this.lastID, foodId: foodIdNum, servings: servingsNum });
              }
            );
          }
        }
      );
    });
  } catch (err) {
    console.error('POST /api/current-meal/items error', err);
    res.status(500).json({ error: 'Failed to add item to current meal' });
  }
});

// Update item servings in current meal
app.put('/api/current-meal/items/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { servings } = req.body || {};
    
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    const servingsNum = toNumber(servings);
    if (!servingsNum || servingsNum <= 0) {
      return res.status(400).json({ error: 'Invalid servings' });
    }

    db.run(
      'UPDATE CurrentMealItems SET servings = ? WHERE id = ?',
      [servingsNum, id],
      function(err) {
        if (err) {
          console.error('PUT /api/current-meal/items/:id error', err);
          return res.status(500).json({ error: 'Failed to update item' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Not found' });
        }

        updateCurrentMealTimestamp();
        broadcastMealUpdate();
        res.json({ id, servings: servingsNum });
      }
    );
  } catch (err) {
    console.error('PUT /api/current-meal/items/:id error', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Delete item from current meal
app.delete('/api/current-meal/items/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
    
    db.run('DELETE FROM CurrentMealItems WHERE id = ?', [id], function(err) {
      if (err) {
        console.error('DELETE /api/current-meal/items/:id error', err);
        return res.status(500).json({ error: 'Failed to delete item' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Not found' });
      }

      updateCurrentMealTimestamp();
      broadcastMealUpdate();
      res.status(204).send();
    });
  } catch (err) {
    console.error('DELETE /api/current-meal/items/:id error', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Clear current meal
app.delete('/api/current-meal', async (req, res) => {
  try {
    db.run('DELETE FROM CurrentMealItems', [], function(err) {
      if (err) {
        console.error('DELETE /api/current-meal error', err);
        return res.status(500).json({ error: 'Failed to clear meal' });
      }
      updateCurrentMealTimestamp();
      broadcastMealUpdate();
      res.status(204).send();
    });
  } catch (err) {
    console.error('DELETE /api/current-meal error', err);
    res.status(500).json({ error: 'Failed to clear meal' });
  }
});

// Helper function to update current meal timestamp
function updateCurrentMealTimestamp() {
  db.run('UPDATE CurrentMeal SET updated_at = CURRENT_TIMESTAMP WHERE id = 1');
}

// Helper function to broadcast meal update to all connected clients
async function broadcastMealUpdate() {
  try {
    db.all(
      `SELECT 
        cmi.id,
        cmi.food_id as foodId,
        cmi.servings,
        f.name,
        f.base_amount as baseAmount,
        f.base_unit as baseUnit,
        f.calories,
        f.protein
      FROM CurrentMealItems cmi
      JOIN Foods f ON cmi.food_id = f.id
      ORDER BY cmi.id ASC`,
      [],
      (err, items) => {
        if (err) {
          console.error('Error fetching meal for broadcast', err);
          return;
        }
        io.emit('meal-updated', items || []);
      }
    );
  } catch (err) {
    console.error('Error broadcasting meal update', err);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, async () => {
  try {
    await initDatabase();
    console.log(`Server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error('Failed to start server', err);
  }
});


