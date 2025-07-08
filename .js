// package.json
{
  "name": "telegram-withdrawal-history",
  "version": "1.0.0",
  "description": "Web app to display Telegram bot withdrawal history",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "node-telegram-bot-api": "^0.63.0",
    "sqlite3": "^5.1.6",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "express-rate-limit": "^6.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "engines": {
    "node": ">=16.0.0"
  }
}

// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./withdrawal_history.db');

// Initialize database tables
db.serialize(() => {
  // Users table for authentication
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  )`);

  // Withdrawals table
  db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    telegram_username TEXT,
    amount REAL,
    currency TEXT DEFAULT 'USD',
    payment_method TEXT,
    wallet_address TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    transaction_hash TEXT,
    notes TEXT
  )`);

  // Create default admin user (change password in production!)
  const defaultPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', ?, 'admin')`, [defaultPassword]);
});

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  });
});

// Get all withdrawals (admin only)
app.get('/api/withdrawals', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const status = req.query.status;

  let query = 'SELECT * FROM withdrawals';
  let params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM withdrawals';
    let countParams = [];
    
    if (status) {
      countQuery += ' WHERE status = ?';
      countParams.push(status);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        withdrawals: rows,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(result.total / limit),
          totalItems: result.total,
          itemsPerPage: limit
        }
      });
    });
  });
});

// Get withdrawal by ID
app.get('/api/withdrawals/:id', authenticateToken, (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM withdrawals WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    res.json(row);
  });
});

// Create new withdrawal (for bot to use)
app.post('/api/withdrawals', (req, res) => {
  const { user_id, telegram_username, amount, currency, payment_method, wallet_address, notes } = req.body;

  if (!user_id || !telegram_username || !amount || !payment_method) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const query = `INSERT INTO withdrawals (user_id, telegram_username, amount, currency, payment_method, wallet_address, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;

  db.run(query, [user_id, telegram_username, amount, currency || 'USD', payment_method, wallet_address, notes], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    res.status(201).json({ id: this.lastID, message: 'Withdrawal request created' });
  });
});

// Update withdrawal status
app.patch('/api/withdrawals/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const id = req.params.id;
  const { status, transaction_hash, notes } = req.body;

  const query = `UPDATE withdrawals 
                 SET status = ?, transaction_hash = ?, notes = ?, processed_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`;

  db.run(query, [status, transaction_hash, notes, id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    res.json({ message: 'Withdrawal updated successfully' });
  });
});

// Statistics endpoint
app.get('/api/stats', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const queries = [
    'SELECT COUNT(*) as total FROM withdrawals',
    'SELECT COUNT(*) as pending FROM withdrawals WHERE status = "pending"',
    'SELECT COUNT(*) as completed FROM withdrawals WHERE status = "completed"',
    'SELECT COUNT(*) as failed FROM withdrawals WHERE status = "failed"',
    'SELECT SUM(amount) as total_amount FROM withdrawals WHERE status = "completed"',
    'SELECT COUNT(*) as today FROM withdrawals WHERE date(created_at) = date("now")'
  ];

  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.get(query, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    })
  )).then(results => {
    res.json({
      total: results[0].total,
      pending: results[1].pending,
      completed: results[2].completed,
      failed: results[3].failed,
      totalAmount: results[4].total_amount || 0,
      today: results[5].today
    });
  }).catch(err => {
    res.status(500).json({ error: 'Database error' });
  });
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Dashboard available at: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});
