import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { createServer } from 'http';
import { Server } from 'socket.io';
import OpenAI from 'openai';

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
    console.log('[DEBUG] POST /api/parse-voice-food called');
    console.log('[DEBUG] Request body:', JSON.stringify(req.body));
    
    if (!openai) {
      console.log('[DEBUG] OpenAI not configured');
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const { text } = req.body || {};
    console.log('[DEBUG] Text received:', text);
    
    if (!text || typeof text !== 'string') {
      console.log('[DEBUG] Invalid text parameter');
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
      console.log('[DEBUG] Detected change command:', parsed);
      res.json({
        command: 'change',
        from: parsed.from,
        to: parsed.to
      });
      return;
    }

    // Normalize to array format for regular food entries
    const foods = Array.isArray(parsed) ? parsed : [parsed];
    console.log('[DEBUG] Processing', foods.length, 'food item(s)');

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
        console.log('[DEBUG] Corrected beverage baseUnit to ml, baseAmount to', baseAmount);
      } else if (isFastFood && baseUnit !== 'servings') {
        baseUnit = 'servings';
        baseAmount = baseAmount || 1;
        console.log('[DEBUG] Corrected fast food baseUnit to servings');
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
      console.log('[DEBUG] Normalized food (database search mode):', JSON.stringify(normalized));
      return normalized;
    });

    console.log('[DEBUG] Returning', result.length, 'food item(s)');
    // Return array (even if single item) for consistency
    res.json(result);
  } catch (err) {
    console.error('[ERROR] POST /api/parse-voice-food error', err);
    console.error('[ERROR] Error stack:', err.stack);
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
          console.error('GET /api/current-meal error', err);
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
    console.error('GET /api/current-meal error', err);
    res.status(500).json({ error: 'Failed to fetch current meal' });
  }
});

// Add item to current meal
app.post('/api/current-meal/items', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/current-meal/items called');
    console.log('[DEBUG] Request body:', JSON.stringify(req.body));
    
    const { foodId, servings, isTemporary, food } = req.body || {};
    console.log('[DEBUG] Parsed params - foodId:', foodId, 'servings:', servings, 'isTemporary:', isTemporary, 'food:', JSON.stringify(food));
    
    if (isTemporary && food) {
      console.log('[DEBUG] Processing temporary food');
      // Handle temporary food
      const servingsNum = toNumber(servings, 1);
      if (!servingsNum || servingsNum <= 0) {
        console.log('[DEBUG] Invalid servings:', servingsNum);
        return res.status(400).json({ error: 'Invalid servings' });
      }
      
      if (!food.name) {
        console.log('[DEBUG] Missing food name');
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
      console.log('[DEBUG] Inserting temporary food with data:', tempFoodData);
      
      // Insert temporary food
      db.run(
        `INSERT INTO CurrentMealItems (
          food_id, servings, temp_food_name, temp_food_base_amount, 
          temp_food_base_unit, temp_food_calories, temp_food_protein
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        tempFoodData,
        function(err) {
          if (err) {
            console.error('[ERROR] POST /api/current-meal/items temp insert error', err);
            console.error('[ERROR] Error details:', err.message);
            console.error('[ERROR] Error code:', err.code);
            return res.status(500).json({ error: 'Failed to add temporary item' });
          }
          console.log('[DEBUG] Temporary food inserted successfully, ID:', this.lastID);
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
    console.log('[DEBUG] broadcastMealUpdate called');
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
          console.error('[ERROR] Error fetching meal for broadcast', err);
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
        console.log('[DEBUG] Broadcasting meal-updated event with', transformed.length, 'items');
        console.log('[DEBUG] Transformed items:', JSON.stringify(transformed));
        io.emit('meal-updated', transformed || []);
      }
    );
  } catch (err) {
    console.error('[ERROR] Error broadcasting meal update', err);
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


