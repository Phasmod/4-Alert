# ⚡ FourMeme Alert Bot - Quick Start (Node.js Only)

## Setup (3 Steps, 5 Minutes)

### Step 1: Get Telegram Bot (2 min)

```bash
# Open Telegram
# Find @BotFather
# Send /newbot
# Choose name & username
# Copy the token (format: 123456:ABC-DEF...)
# Send /start to your new bot
# Get chat ID:
curl "https://api.telegram.org/botYOUR_TOKEN/getUpdates"
# Look for: "chat":{"id":YOUR_CHAT_ID}
```

### Step 2: Configure (1 min)

```bash
cp .env.example .env

# Edit .env:
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=987654321
MIN_MC=5000
MIN_LIQ=3000
```

### Step 3: Run (30 sec)

```bash
npm install
npm run dev
```

## Alert Format

```
🧩FOURMEME🧩
💊 Token Name  (SYMBOL)
0x248d5247e0367D08CcF1FbBEeB97ad8021354444

💰 Token Overview
├ MC: 54.9K | ⏳ 3m
└ Volume: 55.0K | 🟢 485 | 🔴 274
```

## Configuration

```env
# Required
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Filters (defaults shown)
MIN_MC=5000              # Min market cap ($5K)
MIN_LIQ=3000             # Min liquidity ($3K)
BUY_RATIO=0.55           # Min 55% buys
BONDING_MIN=80           # Min 80% bonding
MAX_AGE_SEC=900          # Max 15 min old
```

## RPC Handling

Bot automatically switches RPCs if one fails:

**Primary RPC:**
- https://bnb-mainnet.g.alchemy.com/v2/vhFgTA2whfwnv9WMHKysogde9hNkvTAt

**Fallback RPCs:**
- https://public-bsc-mainnet.fastnode.io
- https://bsc.blockrazor.xyz
- https://bsc-rpc.publicnode.com
- https://bsc-dataseed3.defibit.io
- And 6 more...

## Commands

```bash
# Development (with logs)
npm run dev

# Production
npm start

# Stop
Ctrl+C
```

## Troubleshooting

**No alerts?**
```bash
# Check token
curl "https://api.telegram.org/botYOUR_TOKEN/getMe"

# View logs (look for RPC info)
npm run dev

# Make sure you sent /start to bot!
```

**RPC issues?**
Bot automatically switches to backup RPC if one fails. Check logs for which RPC is active.

**Too many alerts?**
Increase filters in .env:
```env
MIN_MC=50000
BUY_RATIO=0.70
```

## Logs

Bot shows:
- RPC being used
- RPC switches when failures occur
- Tokens detected
- Alerts sent

Example:
```
Switched to backup RPC
{'rpc': 'https://bsc.blockrazor.xyz', 'failedCount': 1}
Starting four.meme listener
Token passed filters
Alert sent to Telegram
```

## You're Ready!

```bash
npm install && npm run dev
```

Get alerts in seconds! 🚀

Min MC: $5K | Min Liquidity: $3K
