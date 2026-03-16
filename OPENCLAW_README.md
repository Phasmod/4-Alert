# 🤖 OpenClaw Integration Guide

## What is OpenClaw?

OpenClaw provides **ML-based token risk assessment** and intelligent filtering:

- 🧠 Machine Learning token scoring
- 🚨 Anomaly detection
- ⚠️ Rug pull risk indicators
- 📊 Confidence intervals
- 💡 Real-time insights

## Setup OpenClaw

### Step 1: Install OpenClaw CLI

```bash
npm install -g @openclaw/cli
```

### Step 2: Login & Initialize

```bash
openclaw auth login
openclaw projects init fourmeme-alert
```

### Step 3: Enable in Bot

Add to `.env`:
```env
USE_OPENCLAW=true
```

Or run with OpenClaw:
```bash
node fourmeme-alert-bot-with-openclaw.js
```

## How It Works

OpenClaw runs **after** basic filtering:

```
Token Detected
    ↓
SmartFilterAgent (basic rules)
├─ Market cap check
├─ Liquidity check
├─ Buy ratio check
├─ Bonding check
└─ Age check
    ↓
    ├→ FAILS → Rejected ❌
    │
    └→ PASSES ✓
         ↓
         OpenClawFilterAgent (if enabled)
         ├─ ML scoring
         ├─ Risk assessment
         ├─ Anomaly detection
         └─ Opportunity detection
              ↓
              ├→ High risk → Rejected ❌
              │
              └→ Good score → Alert ✓
```

## OpenClaw Features

### Risk Assessment

Detects:
- Extreme buy/sell pressure
- Rug pull indicators
- Holder concentration risks
- Bonding anomalies
- Volume inconsistencies

### Token Scoring

ML-based scoring with:
- Historical token patterns
- Market behavior analysis
- Anomaly detection
- Confidence intervals

### Alert Enrichment

OpenClaw can add to alerts:
- Risk level (critical/high/medium/low)
- Risk flags
- Opportunity signals
- Confidence percentage

## Configuration

### Basic (No OpenClaw)

```bash
npm run dev
# Uses SmartFilterAgent only
```

### Advanced (With OpenClaw)

```bash
node fourmeme-alert-bot-with-openclaw.js
# Or set in .env:
USE_OPENCLAW=true
npm run dev
```

## RiskAssessor Module

Built-in risk assessment (no OpenClaw needed):

Checks for:
- ✓ Extreme buy pressure (>90% buys)
- ✓ Low volume relative to liquidity
- ✓ Bonding anomalies
- ✓ No trading activity
- ✓ Holder concentration

Returns:
- riskScore (0-100)
- flags (array of risks)
- severity (critical/high/medium/low)

## HybridFilterAgent

Combines both approaches:
- Uses OpenClaw if available
- Falls back to SmartFilter if not
- Adds risk assessment to both paths

```javascript
const hybrid = new HybridFilterAgent(
  logger,
  smartFilter,
  openclawAgent,
  0.6  // 60% weight to agent
);
```

## Performance Impact

- **Without OpenClaw**: ~2ms per token
- **With OpenClaw**: ~10-50ms per token (depends on model)

For high-throughput scenarios (100+ tokens/sec):
- Consider running OpenClaw separately
- Use caching (built-in 5-second cooldown)
- Scale with multiple workers

## Logs with OpenClaw

```
Starting four.meme listener
OpenClaw integration enabled
Token passed filters: SYMBOL (0x...)
Agent evaluation passed
Alert sent to Telegram
```

## Optional: Separate OpenClaw Service

For very high throughput, run OpenClaw separately:

```bash
# Worker process
node openclaw-worker.js

# Main bot
USE_OPENCLAW_REMOTE=true npm run dev
```

## Files

- `openclaw-integration.js` - OpenClaw adapter
- `fourmeme-alert-bot-with-openclaw.js` - Bot with OpenClaw support
- `fourmeme-alert-bot.js` - Basic bot (no OpenClaw)

## Troubleshooting

**OpenClaw not loading?**
```bash
npm install @openclaw/sdk
openclaw auth login
openclaw projects init fourmeme-alert
```

**Slow performance?**
```env
USE_OPENCLAW=false
# Or increase cache timeout:
OPENCLAW_CACHE_MS=10000
```

**Want ML scoring without OpenClaw?**
Use RiskAssessor module in basic filter.

## Resources

- OpenClaw Docs: https://docs.openclaw.ai
- OpenClaw CLI: `openclaw --help`
- Token Risk Guide: https://docs.openclaw.ai/risk-assessment

---

**OpenClaw is optional!** Bot works great without it using SmartFilterAgent + RiskAssessor.

Choose basic or advanced based on your needs:
- **Basic**: Fast, simple, rule-based
- **Advanced**: ML-powered, smarter, slightly slower
