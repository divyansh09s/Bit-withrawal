# .env.example
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-here
BOT_TOKEN=your-telegram-bot-token-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# vercel.json (for Vercel deployment)
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/server.js"
    }
  ]
}

# railway.json (for Railway deployment)
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}

# render.yaml (for Render deployment)
services:
  - type: web
    name: telegram-withdrawal-app
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: PORT
        value: 10000

# .gitignore
node_modules/
.env
withdrawal_history.db
*.log
.DS_Store
.vscode/
dist/
build/

# README.md
# Telegram Bot Withdrawal History Web App

A complete web application for managing and viewing withdrawal history from your Telegram bot.

## Features

- 🔐 Secure admin authentication
- 📊 Real-time statistics dashboard
- 📋 Withdrawal history table with filtering
- 🔄 Status management (pending, completed, failed)
- 📱 Responsive design
- 🔍 Search and pagination
- 💾 SQLite database

## Quick Start

### Local Development

1. **Clone and setup**
   ```bash
   git clone <your-repo-url>
   cd telegram-withdrawal-app
   npm install
   ```

2. **Environment setup**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start the application**
   ```bash
   npm run dev
   ```

4. **Access the dashboard**
   - Open http://localhost:3000
   - Login with: admin / admin123 (change this!)

### Deployment Options

#### 1. Railway (Recommended)
- Push to GitHub
- Connect to Railway
- Set environment variables
- Deploy automatically

#### 2. Vercel
- Push to GitHub
- Import project to Vercel
- Set environment variables
- Deploy

#### 3. Render
- Push to GitHub
- Connect to Render
- Set environment variables
- Deploy

## API Endpoints

### Authentication
- `POST /api/login` - Login and get JWT token

### Withdrawals
- `GET /api/withdrawals` - Get all withdrawals (admin only)
- `GET /api/withdrawals/:id` - Get specific withdrawal
- `POST /api/withdrawals` - Create new withdrawal (for bot)
- `PATCH /api/withdrawals/:id` - Update withdrawal status

### Statistics
- `GET /api/stats` - Get withdrawal statistics

## Integration with Telegram Bot

### Adding withdrawals from your bot:

```javascript
// In your Telegram bot code
const axios = require('axios');

async function createWithdrawal(userId, username, amount, paymentMethod, walletAddress) {
    try {
        const response = await axios.post('https://your-app-url.com/api/withdrawals', {
            user_id: userId,
            telegram_username: username,
            amount: parseFloat(amount),
            currency: 'USD',
            payment_method: paymentMethod,
            wallet_address: walletAddress,
            notes: 'Created from Telegram bot'
        });
        
        return response.data;
    } catch (error) {
        console.error('Error creating withdrawal:', error);
        throw error;
    }
}

// Usage in your bot
bot.onText(/\/withdraw (.+) (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const amount = match[1];
    const paymentMethod = match[2];
    const walletAddress = match[3];
    
    try {
        const withdrawal = await createWithdrawal(
            chatId,
            msg.from.username,
            amount,
            paymentMethod,
            walletAddress
        );
        
        bot.sendMessage(chatId, `Withdrawal request #${withdrawal.id} created successfully!`);
    } catch (error) {
        bot.sendMessage(chatId, 'Error creating withdrawal request.');
    }
});
```

## Security Notes

1. **Change default credentials** immediately after deployment
2. **Use strong JWT secrets** (generate random string)
3. **Enable HTTPS** in production
4. **Set up proper CORS** for your domain
5. **Regular database backups**

## Database Schema

### Users Table
- id (Primary Key)
- username (Unique)
- password (Hashed)
- role (admin/user)

### Withdrawals Table
- id (Primary Key)
- user_id (Integer)
- telegram_username (Text)
- amount (Real)
- currency (Text, default: USD)
- payment_method (Text)
- wallet_address (Text)
- status (Text: pending/completed/failed)
- created_at (DateTime)
- processed_at (DateTime)
- transaction_hash (Text)
- notes (Text)

## Environment Variables

- `PORT` - Server port (default: 3000)
- `JWT_SECRET` - Secret for JWT tokens
- `BOT_TOKEN` - Your Telegram bot token
- `ADMIN_USERNAME` - Admin username
- `ADMIN_PASSWORD` - Admin password

## Support

For issues or questions:
1. Check the GitHub issues
2. Review the documentation
3. Contact the developer

---

**Default Login:** admin / admin123 (⚠️ Change immediately!)
