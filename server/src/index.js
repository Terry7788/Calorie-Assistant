import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { createServer } from 'http';
import { Server } from 'socket.io';
import OpenAI from 'openai';
import { logger, safeStringify } from './logger.js';
import { SEED_FOODS } from '../seed-foods.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: false,
  },
});
const PORT = process.env.PORT || 4001;

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

      db.run('PRAGMA foreign_keys = ON');
      
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
                    food_id INTEGER,
                    servings REAL NOT NULL,
                    temp_food_name TEXT,
                    temp_food_base_amount REAL,
                    temp_food_base_unit TEXT,
                    temp_food_calories REAL,
                    temp_food_protein REAL,
                    FOREIGN KEY (food_id) REFERENCES Foods(id) ON DELETE CASCADE,
                    CHECK (food_id IS NOT NULL OR (temp_food_name IS NOT NULL))
                  )
                `, (err) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  
                  // Check if we need to migrate the table structure
                  // Check if temp_food_name column exists (indicates new schema)
                  db.all(`PRAGMA table_info(CurrentMealItems)`, [], (err, columns) => {
                    if (err) {
                      resolve();
                      return;
                    }
                    
                    const hasTempColumns = columns && columns.some(col => col.name === 'temp_food_name');
                    const foodIdColumn = columns && columns.find(col => col.name === 'food_id');
                    const foodIdNullable = foodIdColumn && foodIdColumn.notnull === 0;
                    
                    // If temp columns don't exist OR food_id is NOT NULL, we need to migrate
                    if (!hasTempColumns || !foodIdNullable) {
                      // SQLite doesn't support MODIFY COLUMN, so we recreate the table
                      db.run(`PRAGMA foreign_keys=off`, () => {
                        db.run(`BEGIN TRANSACTION`, () => {
                          // Create new table with correct schema
                          db.run(`
                            CREATE TABLE CurrentMealItems_new (
                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                              food_id INTEGER,
                              servings REAL NOT NULL,
                              temp_food_name TEXT,
                              temp_food_base_amount REAL,
                              temp_food_base_unit TEXT,
                              temp_food_calories REAL,
                              temp_food_protein REAL,
                              FOREIGN KEY (food_id) REFERENCES Foods(id) ON DELETE CASCADE,
                              CHECK (food_id IS NOT NULL OR (temp_food_name IS NOT NULL))
                            )
                          `, (err) => {
                            if (!err) {
                              // Copy existing data
                              if (hasTempColumns) {
                                // Copy all columns
                                db.run(`INSERT INTO CurrentMealItems_new SELECT * FROM CurrentMealItems`, (err) => {
                                  if (!err) {
                                    db.run(`DROP TABLE CurrentMealItems`, (err) => {
                                      if (!err) {
                                        db.run(`ALTER TABLE CurrentMealItems_new RENAME TO CurrentMealItems`, (err) => {
                                          db.run(`COMMIT`, () => {
                                            db.run(`PRAGMA foreign_keys=on`, () => {
                                              resolve();
                                            });
                                          });
                                        });
                                      } else {
                                        db.run(`ROLLBACK`, () => {
                                          db.run(`PRAGMA foreign_keys=on`, () => {
                                            resolve();
                                          });
                                        });
                                      }
                                    });
                                  } else {
                                    db.run(`ROLLBACK`, () => {
                                      db.run(`PRAGMA foreign_keys=on`, () => {
                                        resolve();
                                      });
                                    });
                                  }
                                });
                              } else {
                                // Copy only existing columns (id, food_id, servings)
                                db.run(`INSERT INTO CurrentMealItems_new (id, food_id, servings) SELECT id, food_id, servings FROM CurrentMealItems`, (err) => {
                                  if (!err) {
                                    db.run(`DROP TABLE CurrentMealItems`, (err) => {
                                      if (!err) {
                                        db.run(`ALTER TABLE CurrentMealItems_new RENAME TO CurrentMealItems`, (err) => {
                                          db.run(`COMMIT`, () => {
                                            db.run(`PRAGMA foreign_keys=on`, () => {
                                              resolve();
                                            });
                                          });
                                        });
                                      } else {
                                        db.run(`ROLLBACK`, () => {
                                          db.run(`PRAGMA foreign_keys=on`, () => {
                                            resolve();
                                          });
                                        });
                                      }
                                    });
                                  } else {
                                    db.run(`ROLLBACK`, () => {
                                      db.run(`PRAGMA foreign_keys=on`, () => {
                                        resolve();
                                      });
                                    });
                                  }
                                });
                              }
                            } else {
                              db.run(`ROLLBACK`, () => {
                                db.run(`PRAGMA foreign_keys=on`, () => {
                                  resolve();
                                });
                              });
                            }
                          });
                        });
                      });
                    } else {
                      // Table already has correct schema
                      resolve();
                    }
                  });
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

function dbRunAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbAllAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function dbGetAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

async function ensureGymTables() {
  await dbRunAsync(`
    CREATE TABLE IF NOT EXISTS GymExercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      muscle_group TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRunAsync(`
    CREATE TABLE IF NOT EXISTS GymSessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const gymSessionColumns = await dbAllAsync(`PRAGMA table_info(GymSessions)`);
  const hasStatusColumn = gymSessionColumns.some((col) => col.name === 'status');
  if (!hasStatusColumn) {
    await dbRunAsync(`ALTER TABLE GymSessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
  }

  await dbRunAsync(`
    CREATE TABLE IF NOT EXISTS GymSessionExercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      exercise_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES GymSessions(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES GymExercises(id) ON DELETE CASCADE
    )
  `);

  await dbRunAsync(`
    CREATE TABLE IF NOT EXISTS GymSets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_exercise_id INTEGER NOT NULL,
      set_number INTEGER NOT NULL,
      weight_kg REAL,
      reps INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_exercise_id) REFERENCES GymSessionExercises(id) ON DELETE CASCADE
    )
  `);

  const seedExercises = [
    ['Bench Press', 'Chest'],
    ['Incline Dumbbell Press', 'Chest'],
    ['Shoulder Press', 'Shoulders'],
    ['Lat Pulldown', 'Back'],
    ['Barbell Row', 'Back'],
    ['Bicep Curl', 'Arms'],
    ['Tricep Pushdown', 'Arms'],
    ['Squat', 'Legs'],
    ['Leg Press', 'Legs'],
    ['Romanian Deadlift', 'Legs'],
  ];

  for (const [name, muscleGroup] of seedExercises) {
    await dbRunAsync(
      `INSERT OR IGNORE INTO GymExercises (name, muscle_group) VALUES (?, ?)`,
      [name, muscleGroup]
    );
  }
}

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Routes
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// Parse voice input using GPT-4o-mini
app.post('/api/parse-voice-food', async (req, res) => {
  try {
    logger.log('[DEBUG] POST /api/parse-voice-food called');
    logger.log('[DEBUG] Request body:', safeStringify(req.body));
    
    if (!openai) {
      logger.log('[DEBUG] OpenAI not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const { text } = req.body || {};
    logger.log('[DEBUG] Text received:', text);
    
    if (!text || typeof text !== 'string') {
      logger.log('[DEBUG] Invalid text parameter');
      return res.status(400).json({ error: 'Missing or invalid text parameter' });
    }

    const prompt = `You are parsing voice input to search for foods in a database. Your job is to extract the FOOD NAME and optionally amounts/quantities. The system will search the database for these foods.

Spoken text: "${text}"

Return ONLY valid JSON (no markdown, no explanations):

If it's a change command (contains "change", "replace", "swap"):
{
  "command": "change",
  "from": "original food name",
  "to": "new food name"
}

Otherwise, return food object(s) with the FOOD NAME extracted:
Single food:
{
  "name": "Food Name (extract and capitalize properly - this will be used to search the database)",
  "baseAmount": 100,
  "baseUnit": "grams"
}

Multiple foods (if "and" or "&" separates them):
[
  {"name": "Food 1", "baseAmount": 100, "baseUnit": "grams"},
  {"name": "Food 2", "baseAmount": 1, "baseUnit": "servings"}
]

IMPORTANT RULES FOR DATABASE SEARCH MODE:
1. Extract the FOOD NAME accurately - this will be used to search the database
2. Extract amounts if mentioned (e.g., "2 apples" -> baseAmount: 2, baseUnit: "servings")
3. Extract quantities if mentioned (e.g., "200 grams chicken" -> baseAmount: 200, baseUnit: "grams")
4. Extract volumes if mentioned (e.g., "250ml coffee" -> baseAmount: 250, baseUnit: "ml")
5. Do NOT include calories or protein - the database will provide these
6. Focus on extracting the name and quantity/amount accurately for database lookup

EXAMPLES:
"2 apples" -> {"name": "Apple", "baseAmount": 2, "baseUnit": "servings"}
"200 grams chicken breast" -> {"name": "Chicken Breast", "baseAmount": 200, "baseUnit": "grams"}
"one banana" -> {"name": "Banana", "baseAmount": 1, "baseUnit": "servings"}
"250ml skinny flat white" -> {"name": "Skinny Flat White", "baseAmount": 250, "baseUnit": "ml"}
6. Extract serving size from text if mentioned, otherwise use typical serving sizes

ESTIMATION GUIDELINES (use these if values not mentioned):
- Cheeseburger: ~350 calories, ~18g protein, 1 serving
- Coffee drinks: ~0.2-0.4 cal/ml, ~0.02g protein/ml (skinny versions: ~0.24 cal/ml)
- Flat white/latte: ~0.32 cal/ml, ~0.025g protein/ml
- Skinny flat white: ~0.24 cal/ml, ~0.02g protein/ml
- Chicken/meat: ~165 cal/100g, ~31g protein/100g
- Use your knowledge for other foods

EXAMPLES:
"1 flat white skinny" -> {"name": "Skinny Flat White", "calories": 60, "protein": 5, "baseAmount": 250, "baseUnit": "ml"}
"1 cheeseburger" -> {"name": "Cheeseburger", "calories": 350, "protein": 18, "baseAmount": 1, "baseUnit": "servings"}
"200g chicken" -> {"name": "Chicken", "calories": 330, "protein": 62, "baseAmount": 200, "baseUnit": "grams"}

Return JSON only:`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that parses food information from spoken text. Always return valid JSON only, no additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '{}';
    
    // Try to extract JSON from the response (in case it's wrapped in markdown or has extra text)
    let jsonText = responseText;
    // Check for array first, then object
    const arrayMatch = responseText.match(/\[[\s\S]*\]/);
    const objectMatch = responseText.match(/\{[\s\S]*\}/);
    if (arrayMatch) {
      jsonText = arrayMatch[0];
    } else if (objectMatch) {
      jsonText = objectMatch[0];
    }

    const parsed = JSON.parse(jsonText);

    // Check if it's a change command
    if (parsed.command === 'change' && parsed.from && parsed.to) {
      logger.log('[DEBUG] Detected change command:', parsed);
      res.json({
        command: 'change',
        from: parsed.from,
        to: parsed.to
      });
      return;
    }

    // Normalize to array format for regular food entries
    const foods = Array.isArray(parsed) ? parsed : [parsed];
    logger.log('[DEBUG] Processing', foods.length, 'food item(s)');

    // Validate and normalize each food item (for database search, we only need name and amount)
    const result = foods.map(food => {
      const lowerName = (food.name || '').toLowerCase();
      
      // Parse values (calories/protein not needed for database search mode)
      let baseAmount = food.baseAmount !== null && food.baseAmount !== undefined ? Number(food.baseAmount) : null;
      let baseUnit = food.baseUnit && ['grams', 'servings', 'ml'].includes(food.baseUnit) ? food.baseUnit : null;
      
      // Determine baseUnit and baseAmount if missing - fix incorrect units from AI
      const isBeverage = lowerName.includes('coffee') || lowerName.includes('latte') || lowerName.includes('cappuccino') || 
                        lowerName.includes('flat white') || lowerName.includes('espresso') || lowerName.includes('mocha') ||
                        lowerName.includes('americano') || lowerName.includes('tea') || lowerName.includes('juice') ||
                        lowerName.includes('soda') || lowerName.includes('drink');
      const isFastFood = lowerName.includes('burger') || lowerName.includes('sandwich') || lowerName.includes('pizza') ||
                        lowerName.includes('wrap') || lowerName.includes('taco');
      
      // Fix incorrect unit assignment from AI
      if (isBeverage && baseUnit !== 'ml') {
        baseUnit = 'ml';
        if (!baseAmount || baseAmount === 1) {
          if (lowerName.includes('large')) {
            baseAmount = 350;
          } else if (lowerName.includes('small')) {
            baseAmount = 200;
          } else {
            baseAmount = 250; // Regular
          }
        }
        logger.log('[DEBUG] Corrected beverage baseUnit to ml, baseAmount to', baseAmount);
      } else if (isFastFood && baseUnit !== 'servings') {
        baseUnit = 'servings';
        baseAmount = baseAmount || 1;
        logger.log('[DEBUG] Corrected fast food baseUnit to servings');
      } else if (!baseUnit) {
        // If no unit specified and no amount, default to 1 serving (not 100 grams)
        // Only default to grams if an amount was explicitly mentioned
        if (baseAmount && baseAmount > 1) {
          baseUnit = 'grams';
        } else {
          baseUnit = 'servings';
          baseAmount = baseAmount || 1;
        }
      } else if (!baseAmount || baseAmount === 1) {
        if (baseUnit === 'grams') {
          baseAmount = 100;
        } else if (baseUnit === 'ml') {
          baseAmount = 250;
        } else {
          baseAmount = 1;
        }
      }
      
      // For "From Database" mode, we only need name and amount - calories/protein come from database
      const normalized = {
        name: food.name || '',
        baseAmount: baseAmount !== null ? Number(baseAmount) : null,
        baseUnit: baseUnit || 'grams'
        // Note: calories and protein are NOT included - they will come from the database when the food is found
      };
      logger.log('[DEBUG] Normalized food (database search mode):', JSON.stringify(normalized));
      return normalized;
    });

    logger.log('[DEBUG] Returning', result.length, 'food item(s)');
    // Return array (even if single item) for consistency
    res.json(result);
  } catch (err) {
    logger.error('[ERROR] POST /api/parse-voice-food error', err);
    logger.error('[ERROR] Error stack:', err.stack);
    res.status(500).json({ error: 'Failed to parse voice input', details: err.message });
  }
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
        logger.error('GET /api/foods error', err);
        res.status(500).json({ error: 'Failed to fetch foods' });
        return;
      }
      res.json(rows || []);
    });
  } catch (err) {
    logger.error('GET /api/foods error', err);
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
          logger.error('POST /api/foods error', err);
          res.status(500).json({ error: 'Failed to create food' });
          return;
        }
        
        // Return the created food
        db.get(
          'SELECT id, name, base_amount as baseAmount, base_unit as baseUnit, calories, protein FROM Foods WHERE id = ?',
          [this.lastID],
          (err, row) => {
            if (err) {
              logger.error('Error fetching created food', err);
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
    logger.error('POST /api/foods error', err);
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
          logger.error('PUT /api/foods/:id error', err);
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
              logger.error('Error fetching updated food', err);
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
    logger.error('PUT /api/foods/:id error', err);
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
        logger.error('DELETE /api/foods/:id error', err);
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
    logger.error('DELETE /api/foods/:id error', err);
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
        logger.error('GET /api/saved-meals error', err);
        res.status(500).json({ error: 'Failed to fetch saved meals' });
        return;
      }
      res.json(rows || []);
    });
  } catch (err) {
    logger.error('GET /api/saved-meals error', err);
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
          logger.error('GET /api/saved-meals/:id error', err);
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
              logger.error('GET /api/saved-meals/:id items error', err);
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
    logger.error('GET /api/saved-meals/:id error', err);
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
          logger.error('POST /api/saved-meals error', err);
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
              logger.error('POST /api/saved-meals items error', err);
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
                  logger.error('Error fetching created meal', err);
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
    logger.error('POST /api/saved-meals error', err);
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
        logger.error('DELETE /api/saved-meals/:id error', err);
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
    logger.error('DELETE /api/saved-meals/:id error', err);
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
        cmi.temp_food_name as tempFoodName,
        cmi.temp_food_base_amount as tempFoodBaseAmount,
        cmi.temp_food_base_unit as tempFoodBaseUnit,
        cmi.temp_food_calories as tempFoodCalories,
        cmi.temp_food_protein as tempFoodProtein,
        CASE 
          WHEN cmi.food_id IS NULL THEN 1
          ELSE 0
        END as isTemporary,
        f.name,
        f.base_amount as baseAmount,
        f.base_unit as baseUnit,
        f.calories,
        f.protein
      FROM CurrentMealItems cmi
      LEFT JOIN Foods f ON cmi.food_id = f.id
      ORDER BY cmi.id ASC`,
      [],
      (err, items) => {
        if (err) {
          logger.error('GET /api/current-meal error', err);
          res.status(500).json({ error: 'Failed to fetch current meal' });
          return;
        }
            // Transform to include temporary food data
        const transformed = items.map(item => {
          if (item.isTemporary) {
            return {
              id: item.id,
              foodId: null,
              servings: item.servings,
              isTemporary: true,
              name: item.tempFoodName,
              baseAmount: item.tempFoodBaseAmount,
              baseUnit: item.tempFoodBaseUnit,
              calories: item.tempFoodCalories,
              protein: item.tempFoodProtein,
            };
          } else {
            return {
              id: item.id,
              foodId: item.foodId,
              servings: item.servings,
              isTemporary: false,
              name: item.name,
              baseAmount: item.baseAmount,
              baseUnit: item.baseUnit,
              calories: item.calories,
              protein: item.protein,
            };
          }
        });
        res.json(transformed || []);
      }
    );
  } catch (err) {
    logger.error('GET /api/current-meal error', err);
    res.status(500).json({ error: 'Failed to fetch current meal' });
  }
});

// Add item to current meal
app.post('/api/current-meal/items', async (req, res) => {
  try {
    logger.log('[DEBUG] POST /api/current-meal/items called');
    logger.log('[DEBUG] Request body:', safeStringify(req.body));
    
    const { foodId, servings, isTemporary, food } = req.body || {};
    logger.log('[DEBUG] Parsed params - foodId:', foodId, 'servings:', servings, 'isTemporary:', isTemporary, 'food:', JSON.stringify(food));
    
    if (isTemporary && food) {
      logger.log('[DEBUG] Processing temporary food');
      // Handle temporary food
      const servingsNum = toNumber(servings, 1);
      if (!servingsNum || servingsNum <= 0) {
        logger.log('[DEBUG] Invalid servings:', servingsNum);
        return res.status(400).json({ error: 'Invalid servings' });
      }
      
      if (!food.name) {
        logger.log('[DEBUG] Missing food name');
        return res.status(400).json({ error: 'Missing food name' });
      }
      
      const tempFoodData = [
        null, // food_id is null for temporary foods
        servingsNum,
        food.name,
        food.baseAmount || 100,
        food.baseUnit || 'grams',
        food.calories || 0,
        food.protein || null,
      ];
      logger.log('[DEBUG] Inserting temporary food with data:', tempFoodData);
      
      // Insert temporary food
      db.run(
        `INSERT INTO CurrentMealItems (
          food_id, servings, temp_food_name, temp_food_base_amount, 
          temp_food_base_unit, temp_food_calories, temp_food_protein
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        tempFoodData,
        function(err) {
          if (err) {
            logger.error('[ERROR] POST /api/current-meal/items temp insert error', err);
            logger.error('[ERROR] Error details:', err.message);
            logger.error('[ERROR] Error code:', err.code);
            return res.status(500).json({ error: 'Failed to add temporary item' });
          }
          logger.log('[DEBUG] Temporary food inserted successfully, ID:', this.lastID);
          
          // Also create a SavedMeal entry for temporary food
          const calories = food.calories || 0;
          const protein = food.protein || null;
          const mealName = `${food.name} (${Math.round(calories)}kcal ${protein ? Math.round(protein) + 'g protein' : ''})`;
          db.run(
            'INSERT INTO SavedMeals (name) VALUES (?)',
            [mealName],
            (err) => {
              if (!err) {
                logger.log('[DEBUG] Auto-created SavedMeal for temp food:', mealName);
              }
            }
          );
          
          updateCurrentMealTimestamp();
          broadcastMealUpdate();
          res.status(201).json({ 
            id: this.lastID, 
            foodId: null,
            isTemporary: true,
            servings: servingsNum 
          });
        }
      );
      return;
    }
    
    // Handle database food
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
            logger.error('POST /api/current-meal/items error', err);
            return res.status(500).json({ error: 'Failed to check existing item' });
          }

          if (existing) {
            // Update existing item
            db.run(
              'UPDATE CurrentMealItems SET servings = ? WHERE food_id = ?',
              [servingsNum, foodIdNum],
              function(err) {
                if (err) {
                  logger.error('POST /api/current-meal/items update error', err);
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
                  logger.error('POST /api/current-meal/items insert error', err);
                  return res.status(500).json({ error: 'Failed to add item' });
                }
                
                // Also create a SavedMeal entry with this food's nutrition info
                db.get('SELECT name, calories, protein FROM Foods WHERE id = ?', [foodIdNum], (err, food) => {
                  if (food) {
                    // Create saved meal with nutrition info in the name
                    const mealName = `${food.name} (${Math.round(food.calories)}kcal ${food.protein ? Math.round(food.protein) + 'g protein' : ''})`;
                    db.run(
                      'INSERT INTO SavedMeals (name) VALUES (?)',
                      [mealName],
                      (err) => {
                        if (!err) {
                          logger.log('[DEBUG] Auto-created SavedMeal:', mealName);
                        }
                      }
                    );
                  }
                });
                
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
    logger.error('POST /api/current-meal/items error', err);
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
          logger.error('PUT /api/current-meal/items/:id error', err);
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
    logger.error('PUT /api/current-meal/items/:id error', err);
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
        logger.error('DELETE /api/current-meal/items/:id error', err);
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
    logger.error('DELETE /api/current-meal/items/:id error', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Clear current meal
app.delete('/api/current-meal', async (req, res) => {
  try {
    db.run('DELETE FROM CurrentMealItems', [], function(err) {
      if (err) {
        logger.error('DELETE /api/current-meal error', err);
        return res.status(500).json({ error: 'Failed to clear meal' });
      }
      updateCurrentMealTimestamp();
      broadcastMealUpdate();
      res.status(204).send();
    });
  } catch (err) {
    logger.error('DELETE /api/current-meal error', err);
    res.status(500).json({ error: 'Failed to clear meal' });
  }
});

// Gym Routes

// Create gym session
app.post('/api/gym/sessions', async (req, res) => {
  try {
    const { name } = req.body || {};
    const created = await dbRunAsync('INSERT INTO GymSessions (name) VALUES (?)', [name || null]);
    const session = await dbGetAsync(
      `SELECT id, name, status, started_at as startedAt, created_at as createdAt
       FROM GymSessions
       WHERE id = ?`,
      [created.lastID]
    );
    res.status(201).json(session);
  } catch (err) {
    logger.error('POST /api/gym/sessions error', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// List gym sessions
app.get('/api/gym/sessions', async (_req, res) => {
  try {
    const rows = await dbAllAsync(`
      SELECT
        gs.id,
        gs.name,
        gs.status,
        gs.started_at as startedAt,
        gs.created_at as createdAt,
        COUNT(DISTINCT gse.id) as exerciseCount,
        COUNT(DISTINCT gset.id) as setCount
      FROM GymSessions gs
      LEFT JOIN GymSessionExercises gse ON gse.session_id = gs.id
      LEFT JOIN GymSets gset ON gset.session_exercise_id = gse.id
      GROUP BY gs.id
      ORDER BY gs.started_at DESC, gs.id DESC
    `);
    res.json(rows);
  } catch (err) {
    logger.error('GET /api/gym/sessions error', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Get session detail with exercises + sets + previous session values per set number
app.get('/api/gym/sessions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const session = await dbGetAsync(
      `SELECT id, name, status, started_at as startedAt, created_at as createdAt
       FROM GymSessions
       WHERE id = ?`,
      [id]
    );
    if (!session) return res.status(404).json({ error: 'Not found' });

    const exercises = await dbAllAsync(`
      SELECT
        gse.id,
        gse.session_id as sessionId,
        gse.exercise_id as exerciseId,
        gse.exercise_order as exerciseOrder,
        ge.name as exerciseName,
        ge.muscle_group as muscleGroup
      FROM GymSessionExercises gse
      JOIN GymExercises ge ON ge.id = gse.exercise_id
      WHERE gse.session_id = ?
      ORDER BY gse.exercise_order ASC, gse.id ASC
    `, [id]);

    const hydrated = [];
    for (const ex of exercises) {
      const sets = await dbAllAsync(
        `SELECT id, session_exercise_id as sessionExerciseId, set_number as setNumber, weight_kg as weightKg, reps
         FROM GymSets
         WHERE session_exercise_id = ?
         ORDER BY set_number ASC`,
        [ex.id]
      );

      const prevRows = await dbAllAsync(
        `SELECT
          gs2.id as sessionId,
          gset2.set_number as setNumber,
          gset2.weight_kg as weightKg,
          gset2.reps,
          gs2.started_at as startedAt
         FROM GymSessionExercises gse2
         JOIN GymSets gset2 ON gset2.session_exercise_id = gse2.id
         JOIN GymSessions gs2 ON gs2.id = gse2.session_id
         WHERE gse2.exercise_id = ?
           AND gse2.session_id <> ?
           AND (gset2.weight_kg IS NOT NULL OR gset2.reps IS NOT NULL)
         ORDER BY gs2.started_at DESC, gs2.id DESC
         LIMIT 100`,
        [ex.exerciseId, id]
      );

      const lastBySet = {};
      for (const row of prevRows) {
        if (!lastBySet[row.setNumber]) {
          lastBySet[row.setNumber] = {
            weightKg: row.weightKg,
            reps: row.reps,
            sessionId: row.sessionId,
            startedAt: row.startedAt,
          };
        }
      }

      hydrated.push({ ...ex, sets, lastBySet });
    }

    res.json({ ...session, exercises: hydrated });
  } catch (err) {
    logger.error('GET /api/gym/sessions/:id error', err);
    res.status(500).json({ error: 'Failed to fetch session detail' });
  }
});

// Mark session as completed
app.patch('/api/gym/sessions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const result = await dbRunAsync(
      `UPDATE GymSessions
       SET status = 'completed'
       WHERE id = ?`,
      [id]
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

    const session = await dbGetAsync(
      `SELECT id, name, status, started_at as startedAt, created_at as createdAt
       FROM GymSessions
       WHERE id = ?`,
      [id]
    );

    res.json(session);
  } catch (err) {
    logger.error('PATCH /api/gym/sessions/:id error', err);
    res.status(500).json({ error: 'Failed to complete session' });
  }
});

// Delete session
app.delete('/api/gym/sessions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const result = await dbRunAsync('DELETE FROM GymSessions WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

    res.status(204).send();
  } catch (err) {
    logger.error('DELETE /api/gym/sessions/:id error', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// List exercises
app.get('/api/gym/exercises', async (_req, res) => {
  try {
    const rows = await dbAllAsync(
      'SELECT id, name, muscle_group as muscleGroup, created_at as createdAt FROM GymExercises ORDER BY name ASC'
    );
    res.json(rows);
  } catch (err) {
    logger.error('GET /api/gym/exercises error', err);
    res.status(500).json({ error: 'Failed to list exercises' });
  }
});

// Add exercise to a session and precreate sets 1..3
app.post('/api/gym/sessions/:id/exercises', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const { exerciseId } = req.body || {};
    const exerciseIdNum = Number(exerciseId);

    if (!Number.isInteger(sessionId) || !Number.isInteger(exerciseIdNum)) {
      return res.status(400).json({ error: 'Invalid sessionId or exerciseId' });
    }

    const session = await dbGetAsync('SELECT id FROM GymSessions WHERE id = ?', [sessionId]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const exercise = await dbGetAsync('SELECT id FROM GymExercises WHERE id = ?', [exerciseIdNum]);
    if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

    const orderRow = await dbGetAsync('SELECT COALESCE(MAX(exercise_order), -1) as maxOrder FROM GymSessionExercises WHERE session_id = ?', [sessionId]);
    const nextOrder = Number(orderRow?.maxOrder ?? -1) + 1;

    const created = await dbRunAsync(
      'INSERT INTO GymSessionExercises (session_id, exercise_id, exercise_order) VALUES (?, ?, ?)',
      [sessionId, exerciseIdNum, nextOrder]
    );

    for (let i = 1; i <= 3; i += 1) {
      await dbRunAsync(
        'INSERT INTO GymSets (session_exercise_id, set_number, weight_kg, reps) VALUES (?, ?, NULL, NULL)',
        [created.lastID, i]
      );
    }

    const row = await dbGetAsync(
      `SELECT gse.id, gse.session_id as sessionId, gse.exercise_id as exerciseId, gse.exercise_order as exerciseOrder,
              ge.name as exerciseName, ge.muscle_group as muscleGroup
       FROM GymSessionExercises gse
       JOIN GymExercises ge ON ge.id = gse.exercise_id
       WHERE gse.id = ?`,
      [created.lastID]
    );

    const sets = await dbAllAsync(
      `SELECT id, session_exercise_id as sessionExerciseId, set_number as setNumber, weight_kg as weightKg, reps
       FROM GymSets WHERE session_exercise_id = ? ORDER BY set_number ASC`,
      [created.lastID]
    );

    res.status(201).json({ ...row, sets });
  } catch (err) {
    logger.error('POST /api/gym/sessions/:id/exercises error', err);
    res.status(500).json({ error: 'Failed to add exercise to session' });
  }
});

// Update set data
app.put('/api/gym/sets/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { weightKg, reps } = req.body || {};
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const parsedWeight = weightKg === null || weightKg === '' || weightKg === undefined ? null : Number(weightKg);
    const parsedReps = reps === null || reps === '' || reps === undefined ? null : Number(reps);

    if (parsedWeight !== null && !Number.isFinite(parsedWeight)) return res.status(400).json({ error: 'Invalid weightKg' });
    if (parsedReps !== null && !Number.isFinite(parsedReps)) return res.status(400).json({ error: 'Invalid reps' });
    if (parsedWeight !== null && parsedWeight < 0) return res.status(400).json({ error: 'weightKg cannot be negative' });
    if (parsedReps !== null && parsedReps < 0) return res.status(400).json({ error: 'reps cannot be negative' });

    const result = await dbRunAsync(
      'UPDATE GymSets SET weight_kg = ?, reps = ? WHERE id = ?',
      [parsedWeight, parsedReps, id]
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });

    const row = await dbGetAsync(
      'SELECT id, session_exercise_id as sessionExerciseId, set_number as setNumber, weight_kg as weightKg, reps FROM GymSets WHERE id = ?',
      [id]
    );

    res.json(row);
  } catch (err) {
    logger.error('PUT /api/gym/sets/:id error', err);
    res.status(500).json({ error: 'Failed to update set' });
  }
});

// Helper function to update current meal timestamp
function updateCurrentMealTimestamp() {
  db.run('UPDATE CurrentMeal SET updated_at = CURRENT_TIMESTAMP WHERE id = 1');
}

// Helper function to broadcast meal update to all connected clients
async function broadcastMealUpdate() {
  try {
    logger.log('[DEBUG] broadcastMealUpdate called');
    db.all(
      `SELECT 
        cmi.id,
        cmi.food_id as foodId,
        cmi.servings,
        cmi.temp_food_name as tempFoodName,
        cmi.temp_food_base_amount as tempFoodBaseAmount,
        cmi.temp_food_base_unit as tempFoodBaseUnit,
        cmi.temp_food_calories as tempFoodCalories,
        cmi.temp_food_protein as tempFoodProtein,
        CASE 
          WHEN cmi.food_id IS NULL THEN 1
          ELSE 0
        END as isTemporary,
        f.name,
        f.base_amount as baseAmount,
        f.base_unit as baseUnit,
        f.calories,
        f.protein
      FROM CurrentMealItems cmi
      LEFT JOIN Foods f ON cmi.food_id = f.id
      ORDER BY cmi.id ASC`,
      [],
      (err, items) => {
        if (err) {
          logger.error('[ERROR] Error fetching meal for broadcast', err);
          return;
        }
        // Transform to include temporary food data (same as GET endpoint)
        const transformed = items.map(item => {
          if (item.isTemporary) {
            return {
              id: item.id,
              foodId: null,
              servings: item.servings,
              isTemporary: true,
              name: item.tempFoodName,
              baseAmount: item.tempFoodBaseAmount,
              baseUnit: item.tempFoodBaseUnit,
              calories: item.tempFoodCalories,
              protein: item.tempFoodProtein,
            };
          } else {
            return {
              id: item.id,
              foodId: item.foodId,
              servings: item.servings,
              isTemporary: false,
              name: item.name,
              baseAmount: item.baseAmount,
              baseUnit: item.baseUnit,
              calories: item.calories,
              protein: item.protein,
            };
          }
        });
        logger.log('[DEBUG] Broadcasting meal-updated event with', transformed.length, 'items');
        logger.log('[DEBUG] Transformed items:', JSON.stringify(transformed));
        io.emit('meal-updated', transformed || []);
      }
    );
  } catch (err) {
    logger.error('[ERROR] Error broadcasting meal update', err);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    logger.log('Client disconnected:', socket.id);
  });
});

// Seed foods from CSV data if database is empty
async function seedFoodsIfNeeded() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM Foods', [], (err, row) => {
      if (err) {
        logger.error('Error checking food count', err);
        return reject(err);
      }
      
      if (row.count > 0) {
        logger.log(`Database already has ${row.count} foods, skipping seed`);
        return resolve();
      }
      
      logger.log(`Seeding ${SEED_FOODS.length} foods into database...`);
      
      const stmt = db.prepare('INSERT INTO Foods (name, base_amount, base_unit, calories, protein) VALUES (?, ?, ?, ?, ?)');
      let inserted = 0;
      
      for (const food of SEED_FOODS) {
        stmt.run([food.name, food.baseAmount, food.baseUnit, food.calories, food.protein], (err) => {
          if (!err) inserted++;
        });
      }
      
      stmt.finalize((err) => {
        if (err) {
          logger.error('Error seeding foods', err);
          return reject(err);
        }
        logger.log(`Seeded ${inserted} foods successfully`);
        resolve();
      });
    });
  });
}

httpServer.listen(PORT, async () => {
  try {
    await initDatabase();
    await ensureGymTables();
    await seedFoodsIfNeeded();
    logger.log(`Server running on http://localhost:${PORT}`);
  } catch (err) {
    logger.error('Failed to start server', err);
  }
});

