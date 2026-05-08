const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'forecastpro-secret-key-2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Database setup
const db = new sqlite3.Database('./forecastpro.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initDatabase();
  }
});

function initDatabase() {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Forecasts table
  db.run(`CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    inputs TEXT NOT NULL,
    results TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Uploads table
  db.run(`CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    summary TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Activity table
  db.run(`CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // API Keys table
  db.run(`CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    name TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    last_used DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Create default user
  const hashedPassword = bcrypt.hashSync('forecast2026', 10);
  db.run(`INSERT OR IGNORE INTO users (email, password) VALUES (?, ?)`,
    ['user@example.com', hashedPassword]);
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// API Key utilities
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function getKeyPrefix(key) {
  return key.substring(0, 8);
}

// API Key authentication middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const keyHash = hashApiKey(apiKey);

  db.get(`SELECT user_id, is_active FROM api_keys WHERE key_hash = ?`, [keyHash], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!row || !row.is_active) {
      return res.status(403).json({ error: 'Invalid or inactive API key' });
    }

    // Update last used timestamp
    db.run(`UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE key_hash = ?`, [keyHash]);

    req.user = { id: row.user_id };
    next();
  });
}

// Combined authentication (JWT or API Key)
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (authHeader && authHeader.split(' ')[1]) {
    // Try JWT first
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
        return next();
      }
    });
  }

  if (apiKey) {
    // Try API key
    const keyHash = hashApiKey(apiKey);
    db.get(`SELECT user_id, is_active FROM api_keys WHERE key_hash = ?`, [keyHash], (err, row) => {
      if (!err && row && row.is_active) {
        db.run(`UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE key_hash = ?`, [keyHash]);
        req.user = { id: row.user_id };
        return next();
      }
    });
  }

  res.status(401).json({ error: 'Access token or API key required' });
}

// Routes

// Register
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`,
      [email, hashedPassword], function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'User already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }

        const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET);
        res.json({ token, user: { id: this.lastID, email } });
      });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Register alias for public frontend
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run(`INSERT INTO users (email, password) VALUES (?, ?)`,
      [email, hashedPassword], function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'User already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }

        const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET);
        res.json({ token, user: { id: this.lastID, email } });
      });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email } });
  });
});

// Login alias for public frontend
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token, user: { id: user.id, email: user.email } });
  });
});

// Get user data
app.get('/api/user/data', authenticateToken, (req, res) => {
  const userId = req.user.id;

  // Get forecasts
  db.all(`SELECT inputs, results, timestamp FROM forecasts WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10`,
    [userId], (err, forecasts) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      // Get uploads
      db.all(`SELECT filename, original_name, file_size, file_type, summary, timestamp FROM uploads WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10`,
        [userId], (err, uploads) => {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          // Get activity
          db.all(`SELECT event, timestamp FROM activity WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20`,
            [userId], (err, activity) => {
              if (err) {
                return res.status(500).json({ error: 'Database error' });
              }

              res.json({
                forecasts: forecasts || [],
                uploads: uploads || [],
                activity: activity || []
              });
            });
        });
    });
});

// Add forecast
app.post('/api/forecast', authenticateToken, (req, res) => {
  const { inputs, results } = req.body;
  const userId = req.user.id;

  db.run(`INSERT INTO forecasts (user_id, inputs, results) VALUES (?, ?, ?)`,
    [userId, JSON.stringify(inputs), JSON.stringify(results)], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      // Add activity
      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `Forecast created for ${inputs.join(', ')} -> ${results.join(', ')}`]);

      res.json({ success: true, id: this.lastID });
    });
});

// Forecast alias for public frontend
app.post('/api/forecasts', authenticateToken, (req, res) => {
  const { inputs, results } = req.body;
  const userId = req.user.id;

  db.run(`INSERT INTO forecasts (user_id, inputs, results) VALUES (?, ?, ?)`,
    [userId, JSON.stringify(inputs), JSON.stringify(results)], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `Forecast created for ${inputs.join(', ')} -> ${results.join(', ')}`]);

      res.json({ success: true, id: this.lastID });
    });
});

// File upload
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const userId = req.user.id;
  const { originalname, filename, size, mimetype } = req.file;

  // Simple file analysis (you can enhance this)
  const summary = `File uploaded: ${originalname} (${(size / 1024).toFixed(2)} KB)`;

  db.run(`INSERT INTO uploads (user_id, filename, original_name, file_size, file_type, file_path, summary) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, filename, originalname, size, mimetype, req.file.path, summary], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      // Add activity
      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `File uploaded: ${originalname}`]);

      res.json({
        success: true,
        file: {
          id: this.lastID,
          name: originalname,
          size,
          type: mimetype,
          summary
        }
      });
    });
});

// Upload metadata alias for public frontend
app.post('/api/uploads', authenticateToken, (req, res) => {
  const { name, size, type, summary } = req.body;
  const userId = req.user.id;
  const originalName = name || 'uploaded-file';
  const fileType = type || 'unknown';

  db.run(`INSERT INTO uploads (user_id, filename, original_name, file_size, file_type, file_path, summary) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, originalName, originalName, size || 0, fileType, '', summary || 'File metadata uploaded'], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `File metadata saved: ${originalName}`]);

      res.json({
        success: true,
        file: {
          id: this.lastID,
          name: originalName,
          size: size || 0,
          type: fileType,
          summary: summary || ''
        }
      });
    });
});

// Get all forecasts
app.get('/api/forecasts', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const limit = req.query.limit || 50;
  const offset = req.query.offset || 0;

  db.all(`SELECT id, inputs, results, timestamp FROM forecasts WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset], (err, forecasts) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      // Parse JSON fields
      const parsedForecasts = forecasts.map(f => ({
        ...f,
        inputs: JSON.parse(f.inputs),
        results: JSON.parse(f.results)
      }));

      res.json({ forecasts: parsedForecasts });
    });
});

// Get forecast by ID
app.get('/api/forecast/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const forecastId = req.params.id;

  db.get(`SELECT id, inputs, results, timestamp FROM forecasts WHERE id = ? AND user_id = ?`,
    [forecastId, userId], (err, forecast) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!forecast) {
        return res.status(404).json({ error: 'Forecast not found' });
      }

      res.json({
        id: forecast.id,
        inputs: JSON.parse(forecast.inputs),
        results: JSON.parse(forecast.results),
        timestamp: forecast.timestamp
      });
    });
});

// Update forecast
app.put('/api/forecast/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const forecastId = req.params.id;
  const { inputs, results } = req.body;

  if (!inputs || !results) {
    return res.status(400).json({ error: 'Inputs and results required' });
  }

  db.run(`UPDATE forecasts SET inputs = ?, results = ? WHERE id = ? AND user_id = ?`,
    [JSON.stringify(inputs), JSON.stringify(results), forecastId, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Forecast not found' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `Forecast #${forecastId} updated`]);

      res.json({ success: true, id: forecastId });
    });
});

// Delete forecast
app.delete('/api/forecast/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const forecastId = req.params.id;

  db.run(`DELETE FROM forecasts WHERE id = ? AND user_id = ?`,
    [forecastId, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Forecast not found' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `Forecast #${forecastId} deleted`]);

      res.json({ success: true });
    });
});

// Get all uploads
app.get('/api/uploads', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const limit = req.query.limit || 50;
  const offset = req.query.offset || 0;

  db.all(`SELECT id, original_name, file_size, file_type, summary, timestamp FROM uploads WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset], (err, uploads) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({ uploads: uploads || [] });
    });
});

// Get upload by ID
app.get('/api/upload/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const uploadId = req.params.id;

  db.get(`SELECT id, original_name, file_size, file_type, file_path, summary, timestamp FROM uploads WHERE id = ? AND user_id = ?`,
    [uploadId, userId], (err, upload) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      res.json(upload);
    });
});

// Delete upload
app.delete('/api/upload/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const uploadId = req.params.id;

  db.get(`SELECT file_path FROM uploads WHERE id = ? AND user_id = ?`,
    [uploadId, userId], (err, upload) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!upload) {
        return res.status(404).json({ error: 'Upload not found' });
      }

      // Delete file from disk
      if (upload.file_path && fs.existsSync(upload.file_path)) {
        fs.unlinkSync(upload.file_path);
      }

      // Delete from database
      db.run(`DELETE FROM uploads WHERE id = ? AND user_id = ?`,
        [uploadId, userId], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Database error' });
          }

          db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
            [userId, `Upload #${uploadId} deleted`]);

          res.json({ success: true });
        });
    });
});

// Get activity
app.get('/api/activity', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const limit = req.query.limit || 50;
  const offset = req.query.offset || 0;

  db.all(`SELECT id, event, timestamp FROM activity WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset], (err, activity) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({ activity: activity || [] });
    });
});

// Add activity
app.post('/api/activity', authenticateToken, (req, res) => {
  const { event } = req.body;
  const userId = req.user.id;

  if (!event) {
    return res.status(400).json({ error: 'Event required' });
  }

  db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
    [userId, event], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ success: true, id: this.lastID });
    });
});

// Get user profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.get(`SELECT id, email, created_at FROM users WHERE id = ?`,
    [userId], (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      db.get(`SELECT COUNT(*) as count FROM forecasts WHERE user_id = ?`,
        [userId], (err, forecastCount) => {
          db.get(`SELECT COUNT(*) as count FROM uploads WHERE user_id = ?`,
            [userId], (err, uploadCount) => {
              res.json({
                id: user.id,
                email: user.email,
                createdAt: user.created_at,
                totalForecasts: forecastCount ? forecastCount.count : 0,
                totalUploads: uploadCount ? uploadCount.count : 0
              });
            });
        });
    });
});

// Update user profile
app.put('/api/user/profile', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  db.run(`UPDATE users SET email = ? WHERE id = ?`,
    [email, userId], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Email already in use' });
        }
        return res.status(500).json({ error: 'Database error' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `Profile updated`]);

      res.json({ success: true });
    });
});

// Change password
app.post('/api/user/change-password', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  db.get(`SELECT password FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.run(`UPDATE users SET password = ? WHERE id = ?`,
      [hashedPassword, userId], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Database error' });
        }

        db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
          [userId, `Password changed`]);

        res.json({ success: true });
      });
  });
});

// Get dashboard analytics
app.get('/api/analytics/dashboard', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.get(`SELECT COUNT(*) as count FROM forecasts WHERE user_id = ?`,
    [userId], (err, forecastCount) => {
      db.get(`SELECT COUNT(*) as count FROM uploads WHERE user_id = ?`,
        [userId], (err, uploadCount) => {
          db.get(`SELECT COUNT(*) as count FROM activity WHERE user_id = ?`,
            [userId], (err, activityCount) => {
              db.all(`SELECT DATE(timestamp) as date, COUNT(*) as count FROM forecasts WHERE user_id = ? GROUP BY DATE(timestamp) ORDER BY date DESC LIMIT 7`,
                [userId], (err, forecastTrend) => {
                  res.json({
                    totalForecasts: forecastCount ? forecastCount.count : 0,
                    totalUploads: uploadCount ? uploadCount.count : 0,
                    totalActivities: activityCount ? activityCount.count : 0,
                    recentForecasts: forecastTrend || [],
                    timestamp: new Date().toISOString()
                  });
                });
            });
        });
    });
});

// Export user data
app.get('/api/user/export', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.all(`SELECT * FROM forecasts WHERE user_id = ?`, [userId], (err, forecasts) => {
    db.all(`SELECT * FROM uploads WHERE user_id = ?`, [userId], (err, uploads) => {
      const exportData = {
        exportDate: new Date().toISOString(),
        forecasts: forecasts ? forecasts.map(f => ({
          ...f,
          inputs: JSON.parse(f.inputs),
          results: JSON.parse(f.results)
        })) : [],
        uploads: uploads || []
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=forecastpro-export.json');
      res.json(exportData);
    });
  });
});

// Data Analysis Endpoints

// Analyze forecast data
app.post('/api/analysis/forecast', authenticateToken, (req, res) => {
  const { inputs, results } = req.body;

  if (!inputs || !results || inputs.length < 2) {
    return res.status(400).json({ error: 'Requires at least 2 input values and results' });
  }

  try {
    const inputsNum = inputs.map(Number);
    const resultsNum = results.map(Number);

    // Calculate growth
    const growth1 = inputsNum.length > 1 ? ((inputsNum[1] - inputsNum[0]) / inputsNum[0] * 100).toFixed(2) : 0;
    const growth2 = inputsNum.length > 2 ? ((inputsNum[2] - inputsNum[1]) / inputsNum[1] * 100).toFixed(2) : 0;
    
    // Calculate averages
    const inputAvg = (inputsNum.reduce((a, b) => a + b) / inputsNum.length).toFixed(2);
    const resultAvg = (resultsNum.reduce((a, b) => a + b) / resultsNum.length).toFixed(2);
    
    // Trend analysis
    const trend = growth1 > 0 && growth2 > 0 ? 'upward' : (growth1 < 0 && growth2 < 0 ? 'downward' : 'mixed');
    
    // Confidence score (0-100)
    const volatility = Math.abs(growth1 - growth2);
    const confidence = Math.max(0, Math.min(100, 100 - volatility));

    res.json({
      analysis: {
        inputAverage: inputAvg,
        resultAverage: resultAvg,
        growth: [growth1, growth2],
        trend: trend,
        confidence: confidence.toFixed(2),
        volatility: volatility.toFixed(2),
        dataPoints: inputsNum.length
      }
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// Generate business insights
app.post('/api/analysis/insights', authenticateToken, (req, res) => {
  const { inputs, results } = req.body;

  if (!inputs || !results) {
    return res.status(400).json({ error: 'Requires inputs and results' });
  }

  try {
    const inputsNum = inputs.map(Number);
    const resultsNum = results.map(Number);

    // Calculate metrics
    const totalInput = inputsNum.reduce((a, b) => a + b);
    const totalResult = resultsNum.reduce((a, b) => a + b);
    const growthRate = ((totalResult - totalInput) / totalInput * 100).toFixed(2);
    
    // Calculate max/min for anomaly detection
    const maxInput = Math.max(...inputsNum);
    const minInput = Math.min(...inputsNum);
    const range = maxInput - minInput;
    
    // Generate insights
    const insights = [];

    if (growthRate > 20) {
      insights.push({
        type: 'positive',
        title: 'Strong Growth Trajectory',
        description: `Your forecasted results show ${growthRate}% growth. This indicates strong positive momentum in your sales.`,
        recommendation: 'Consider expanding resources to capitalize on this growth.'
      });
    } else if (growthRate < -20) {
      insights.push({
        type: 'warning',
        title: 'Declining Trend Detected',
        description: `Forecasted results show ${growthRate}% decline. This suggests potential market challenges.`,
        recommendation: 'Review pricing, marketing, and customer retention strategies.'
      });
    } else {
      insights.push({
        type: 'info',
        title: 'Stable Performance',
        description: `Growth rate of ${growthRate}% indicates stable market conditions.`,
        recommendation: 'Focus on optimization and marginal improvements.'
      });
    }

    // Volatility insight
    if (range > totalInput / 2) {
      insights.push({
        type: 'warning',
        title: 'High Volatility Detected',
        description: `Your data shows significant fluctuations (range: ${range}). This suggests variable market conditions.`,
        recommendation: 'Improve demand forecasting accuracy and build flexible inventory strategies.'
      });
    }

    // Opportunity insight
    if (maxInput > inputsNum.reduce((a, b) => a + b) / inputsNum.length * 1.5) {
      insights.push({
        type: 'positive',
        title: 'Peak Performance Opportunity',
        description: `You've achieved peak sales of ${maxInput}. Analyze what drove this success.`,
        recommendation: 'Replicate the conditions that led to peak performance.'
      });
    }

    if (insights.length === 1) {
      insights.push({
        type: 'info',
        title: 'Data Summary',
        description: `Analyzing ${inputsNum.length} data points with average value of ${(totalInput / inputsNum.length).toFixed(2)}.`,
        recommendation: 'Collect more historical data for deeper insights.'
      });
    }

    res.json({
      insights: insights,
      summary: {
        totalDataPoints: inputsNum.length,
        averageInput: (totalInput / inputsNum.length).toFixed(2),
        averageResult: (totalResult / resultsNum.length).toFixed(2),
        growthRate: growthRate,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// Statistical analysis
app.post('/api/analysis/statistics', authenticateToken, (req, res) => {
  const { data } = req.body;

  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'Requires array of numeric data' });
  }

  try {
    const numData = data.map(Number).filter(n => !isNaN(n));
    
    if (numData.length === 0) {
      return res.status(400).json({ error: 'No valid numeric data found' });
    }

    // Sort for median and percentiles
    const sorted = [...numData].sort((a, b) => a - b);

    // Calculate statistics
    const sum = numData.reduce((a, b) => a + b);
    const mean = sum / numData.length;
    const median = numData.length % 2 === 0 
      ? (sorted[numData.length / 2 - 1] + sorted[numData.length / 2]) / 2 
      : sorted[Math.floor(numData.length / 2)];
    
    const variance = numData.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / numData.length;
    const stdDev = Math.sqrt(variance);
    
    const min = Math.min(...numData);
    const max = Math.max(...numData);
    const range = max - min;

    // Percentiles
    const p25 = sorted[Math.floor(numData.length * 0.25)];
    const p75 = sorted[Math.floor(numData.length * 0.75)];

    res.json({
      statistics: {
        count: numData.length,
        sum: sum.toFixed(2),
        mean: mean.toFixed(2),
        median: median.toFixed(2),
        min: min,
        max: max,
        range: range,
        variance: variance.toFixed(2),
        standardDeviation: stdDev.toFixed(2),
        q1: p25,
        q3: p75,
        iqr: (p75 - p25).toFixed(2)
      }
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// Trend analysis
app.post('/api/analysis/trends', authenticateToken, (req, res) => {
  const { data } = req.body;

  if (!Array.isArray(data) || data.length < 2) {
    return res.status(400).json({ error: 'Requires array with at least 2 data points' });
  }

  try {
    const numData = data.map(Number).filter(n => !isNaN(n));
    
    if (numData.length < 2) {
      return res.status(400).json({ error: 'Not enough valid numeric data' });
    }

    // Calculate period-over-period growth
    const growthRates = [];
    for (let i = 1; i < numData.length; i++) {
      const growth = ((numData[i] - numData[i - 1]) / numData[i - 1] * 100);
      growthRates.push(parseFloat(growth.toFixed(2)));
    }

    const avgGrowth = (growthRates.reduce((a, b) => a + b) / growthRates.length).toFixed(2);
    const trend = avgGrowth > 0 ? 'upward' : (avgGrowth < 0 ? 'downward' : 'stable');

    res.json({
      trends: {
        dataPoints: numData.length,
        growthRates: growthRates,
        averageGrowth: avgGrowth,
        trend: trend,
        firstValue: numData[0],
        lastValue: numData[numData.length - 1],
        totalChange: ((numData[numData.length - 1] - numData[0]) / numData[0] * 100).toFixed(2)
      }
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// Anomaly detection
app.post('/api/analysis/anomalies', authenticateToken, (req, res) => {
  const { data } = req.body;

  if (!Array.isArray(data) || data.length < 3) {
    return res.status(400).json({ error: 'Requires array with at least 3 data points' });
  }

  try {
    const numData = data.map(Number).filter(n => !isNaN(n));
    const mean = numData.reduce((a, b) => a + b) / numData.length;
    const variance = numData.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / numData.length;
    const stdDev = Math.sqrt(variance);

    const anomalies = [];
    numData.forEach((value, index) => {
      const zScore = Math.abs((value - mean) / stdDev);
      if (zScore > 2) { // Standard anomaly threshold
        anomalies.push({
          index: index,
          value: value,
          zScore: zScore.toFixed(2),
          severity: zScore > 3 ? 'high' : 'medium'
        });
      }
    });

    res.json({
      anomalies: {
        count: anomalies.length,
        detectedAnomalies: anomalies,
        threshold: 2,
        mean: mean.toFixed(2),
        stdDev: stdDev.toFixed(2)
      }
    });
  } catch (error) {
    res.status(400).json({ error: 'Invalid data format' });
  }
});

// Generate API key
app.post('/api/keys/generate', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'API key name required' });
  }

  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const keyPrefix = getKeyPrefix(apiKey);

  db.run(`INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?)`,
    [userId, keyHash, keyPrefix, name], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `API key generated: ${name}`]);

      // Only return the full key once during generation
      res.json({
        id: this.lastID,
        name: name,
        apiKey: apiKey, // Full key - only shown once
        keyPrefix: keyPrefix,
        message: 'Save your API key somewhere safe. You won\'t be able to see it again.'
      });
    });
});

// Get all API keys (masked)
app.get('/api/keys', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.all(`SELECT id, name, key_prefix, is_active, last_used, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    [userId], (err, keys) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      const maskedKeys = keys.map(k => ({
        id: k.id,
        name: k.name,
        keyPreview: k.key_prefix + '****' + k.key_prefix,
        isActive: k.is_active === 1,
        lastUsed: k.last_used,
        createdAt: k.created_at
      }));

      res.json({ keys: maskedKeys });
    });
});

// Get API key by ID
app.get('/api/keys/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const keyId = req.params.id;

  db.get(`SELECT id, name, key_prefix, is_active, last_used, created_at FROM api_keys WHERE id = ? AND user_id = ?`,
    [keyId, userId], (err, key) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!key) {
        return res.status(404).json({ error: 'API key not found' });
      }

      res.json({
        id: key.id,
        name: key.name,
        keyPreview: key.key_prefix + '****' + key.key_prefix,
        isActive: key.is_active === 1,
        lastUsed: key.last_used,
        createdAt: key.created_at
      });
    });
});

// Update API key name
app.put('/api/keys/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const keyId = req.params.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'API key name required' });
  }

  db.run(`UPDATE api_keys SET name = ? WHERE id = ? AND user_id = ?`,
    [name, keyId, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `API key updated: ${name}`]);

      res.json({ success: true });
    });
});

// Revoke API key
app.delete('/api/keys/:id', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const keyId = req.params.id;

  db.run(`UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?`,
    [keyId, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `API key revoked`]);

      res.json({ success: true });
    });
});

// Permanently delete API key
app.delete('/api/keys/:id/permanent', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const keyId = req.params.id;

  db.run(`DELETE FROM api_keys WHERE id = ? AND user_id = ?`,
    [keyId, userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }

      db.run(`INSERT INTO activity (user_id, event) VALUES (?, ?)`,
        [userId, `API key permanently deleted`]);

      res.json({ success: true });
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`ForecastPro server running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}/api`);
});