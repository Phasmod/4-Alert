import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import pino from 'pino';
import { EventEmitter } from 'events';
import { OpenClawFilterAgent, RiskAssessor, HybridFilterAgent } from './openclaw-integration.js';

dotenv.config();

// ============================================================================
// RPC MANAGER WITH AUTOMATIC FALLBACK
// ============================================================================

class RPCManager {
  constructor(logger) {
    this.logger = logger;
    this.rpcs = [
      'https://bnb-mainnet.g.alchemy.com/v2/vhFgTA2whfwnv9WMHKysogde9hNkvTAt',
      'https://public-bsc-mainnet.fastnode.io',
      'https://bsc.blockrazor.xyz',
      'https://bsc-rpc.publicnode.com',
      'https://bsc-dataseed3.defibit.io',
      'https://bsc-dataseed4.defibit.io',
      'https://bsc-dataseed1.defibit.io',
      'https://bsc-dataseed1.ninicoin.io',
      'https://bsc-dataseed2.defibit.io',
      'https://bsc-dataseed3.defibit.io',
      'https://bsc-dataseed4.defibit.io',
    ];
    this.currentIndex = 0;
    this.failedIndices = new Set();
  }

  getCurrentRPC() {
    return this.rpcs[this.currentIndex];
  }

  async switchRPC() {
    this.failedIndices.add(this.currentIndex);
    
    for (let i = 0; i < this.rpcs.length; i++) {
      const nextIndex = (this.currentIndex + 1) % this.rpcs.length;
      if (!this.failedIndices.has(nextIndex)) {
        this.currentIndex = nextIndex;
        this.logger.warn(
          { rpc: this.rpcs[nextIndex], failedCount: this.failedIndices.size },
          'Switched to backup RPC'
        );
        return this.rpcs[nextIndex];
      }
      this.currentIndex = nextIndex;
    }

    if (this.failedIndices.size === this.rpcs.length) {
      this.failedIndices.clear();
      this.currentIndex = 0;
      this.logger.warn('All RPCs failed, resetting and retrying from first');
      return this.rpcs[0];
    }
  }

  markSuccess() {
    if (this.failedIndices.size > 5) {
      this.failedIndices.clear();
      this.logger.info('Cleared RPC failure history');
    }
  }
}

// ============================================================================
// TOKEN SCORER ENGINE
// ============================================================================

class TokenScorer {
  constructor(logger) {
    this.logger = logger;
  }

  score(metrics) {
    let score = 0;
    const factors = {};

    const mcLower = 5_000n;
    const mcOptimal = 50_000n;
    const mcUpper = 500_000n;

    if (metrics.marketCap >= mcLower && metrics.marketCap <= mcUpper) {
      const normalized =
        metrics.marketCap <= mcOptimal
          ? Number((metrics.marketCap - mcLower) * 10n) / Number(mcOptimal - mcLower)
          : Number((mcUpper - metrics.marketCap) * 10n) / Number(mcUpper - mcOptimal);
      factors['mc'] = Math.min(normalized, 25);
    } else {
      factors['mc'] = 0;
    }

    const volRatio = metrics.liquidity > 0n ? Number(metrics.volume) / Number(metrics.liquidity) : 0;
    factors['volume'] = Math.min((volRatio / 0.5) * 20, 20);

    const totalTrades = metrics.buys + metrics.sells;
    if (totalTrades > 0) {
      const buyRatio = metrics.buys / totalTrades;
      factors['buyRatio'] = Math.min((buyRatio / 0.6) * 30, 30);
    } else {
      factors['buyRatio'] = 0;
    }

    if (metrics.bondingProgress >= 90) {
      factors['bonding'] = 15;
    } else {
      factors['bonding'] = (metrics.bondingProgress / 90) * 15;
    }

    const ageMinutes = (Date.now() - metrics.createdAt) / 60000;
    if (ageMinutes < 5) {
      factors['momentum'] = 10;
    } else if (ageMinutes < 10) {
      factors['momentum'] = 7;
    } else if (ageMinutes < 15) {
      factors['momentum'] = 4;
    } else {
      factors['momentum'] = 0;
    }

    score = Object.values(factors).reduce((a, b) => a + b, 0);
    return Math.round(score);
  }
}

// ============================================================================
// SMART FILTER AGENT
// ============================================================================

class SmartFilterAgent {
  constructor(logger, config) {
    this.logger = logger;
    this.scorer = new TokenScorer(logger);
    this.config = config;
  }

  async evaluate(metrics) {
    const reasons = [];

    if (metrics.marketCap < this.config.minMarketCap) return null;
    if (metrics.marketCap > this.config.maxMarketCap) return null;
    if (metrics.liquidity < this.config.minLiquidity) return null;

    const totalTrades = metrics.buys + metrics.sells;
    if (totalTrades < this.config.minBuys) return null;

    const buyRatio = metrics.buys / totalTrades;
    if (buyRatio < this.config.buyRatio) return null;

    const ageSeconds = (Date.now() - metrics.createdAt) / 1000;
    if (ageSeconds > this.config.maxAgeSeconds) return null;

    const finalScore = this.scorer.score(metrics);

    this.logger.info(
      { address: metrics.address, symbol: metrics.symbol, score: finalScore },
      'Token passed filters'
    );

    return {
      metrics,
      score: finalScore,
      reasoning: reasons,
      alerts: [],
    };
  }
}

// ============================================================================
// TELEGRAM ALERT FORMATTER - EXACT FORMAT
// ============================================================================

class TelegramFormatter {
  static formatAlert(token) {
    const t = token.metrics;
    const mcStr = this.formatWei(t.marketCap);
    const volStr = this.formatWei(t.volume);

    let message = `🧩FOURMEME🧩\n`;
    message += `💊 ${t.name}  (${t.symbol})\n`;
    message += `${t.address}\n\n`;

    message += `💰 Token Overview\n`;
    message += `├ MC: ${mcStr} | ⏳ ${this.getAge(t.createdAt)}\n`;
    message += `└ Volume: ${volStr} | 🟢 ${t.buys} | 🔴 ${t.sells}\n`;

    return message;
  }

  static formatWei(wei) {
    const num = Number(wei);
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toFixed(0);
  }

  static getAge(createdAt) {
    const seconds = Math.floor((Date.now() - createdAt) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  }
}

// ============================================================================
// FOUR.MEME EVENT LISTENER WITH RPC FALLBACK
// ============================================================================

class FourMemeListener extends EventEmitter {
  constructor(logger, rpcManager) {
    super();
    this.logger = logger;
    this.rpcManager = rpcManager;
    this.isListening = false;
    this.lastBlock = 0;
    this.pollInterval = 3000;
  }

  async createAPI() {
    return axios.create({
      baseURL: this.rpcManager.getCurrentRPC(),
      timeout: 10000,
    });
  }

  async start(fromBlock = 0) {
    if (this.isListening) return;

    this.isListening = true;
    this.lastBlock = fromBlock;

    this.logger.info({ fromBlock: this.lastBlock }, 'Starting four.meme listener');
    this.pollEvents();
  }

  async pollEvents() {
    while (this.isListening) {
      try {
        const toBlock = this.lastBlock + 100;

        const api = await this.createAPI();
        const response = await api.get('/events', {
          params: {
            fromBlock: this.lastBlock,
            toBlock,
            types: 'TokenCreate,TokenPurchase,TokenSale',
          },
        });

        const events = response.data || [];

        for (const event of events) {
          if (event.type === 'TokenCreate') {
            this.emit('tokenCreate', this.parseTokenCreateEvent(event));
          } else if (event.type === 'TokenPurchase') {
            this.emit('tokenPurchase', this.parseTradeEvent(event));
          } else if (event.type === 'TokenSale') {
            this.emit('tokenSale', this.parseTradeEvent(event));
          }
        }

        this.rpcManager.markSuccess();
        this.lastBlock = toBlock;

        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      } catch (error) {
        this.logger.error(error, 'Error polling events, switching RPC...');
        await this.rpcManager.switchRPC();
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  parseTokenCreateEvent(event) {
    return {
      address: event.tokenAddress,
      name: event.name || 'Unknown',
      symbol: event.symbol || '???',
      marketCap: BigInt(event.marketCap || 0),
      liquidity: BigInt(event.liquidity || 0),
      volume: BigInt(0),
      buys: 0,
      sells: 0,
      bondingProgress: Number(event.bondingProgress) || 0,
      createdAt: Date.now(),
      totalSupply: event.totalSupply ? BigInt(event.totalSupply) : undefined,
      holder: event.creator,
    };
  }

  parseTradeEvent(event) {
    return {
      address: event.tokenAddress,
      volume: BigInt(event.value || 0),
      buys: event.type === 'TokenPurchase' ? 1 : 0,
      sells: event.type === 'TokenSale' ? 1 : 0,
    };
  }

  stop() {
    this.isListening = false;
  }
}

// ============================================================================
// MAIN BOT ORCHESTRATOR
// ============================================================================

class FourMemeAlertBot {
  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN env var required');

    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    if (!this.chatId) throw new Error('TELEGRAM_CHAT_ID env var required');

    this.telegram = new TelegramBot(token, { polling: false });

    this.config = {
      minMarketCap: BigInt(process.env.MIN_MC || '5000'),
      maxMarketCap: BigInt(process.env.MAX_MC || '10000000'),
      minLiquidity: BigInt(process.env.MIN_LIQ || '3000'),
      minBuys: parseInt(process.env.MIN_BUYS || '5'),
      buyRatio: parseFloat(process.env.BUY_RATIO || '0.55'),
      maxAgeSeconds: parseInt(process.env.MAX_AGE_SEC || '900'),
      bondingThreshold: parseFloat(process.env.BONDING_MIN || '80'),
    };

    this.rpcManager = new RPCManager(this.logger);
    this.listener = new FourMemeListener(this.logger, this.rpcManager);
    this.basicFilter = new SmartFilterAgent(this.logger, this.config);

    // Optional OpenClaw integration
    this.useOpenClaw = process.env.USE_OPENCLAW === 'true';
    if (this.useOpenClaw) {
      this.openclaw = new OpenClawFilterAgent(this.logger, 'fourmeme-token-scorer');
      this.filter = new HybridFilterAgent(this.logger, this.basicFilter, this.openclaw);
    } else {
      this.filter = this.basicFilter;
    }

    this.setupListeners();
  }

  setupListeners() {
    this.listener.on('tokenCreate', async (metrics) => {
      try {
        const filtered = await this.filter.evaluate(metrics);
        if (filtered) {
          await this.sendAlert(filtered);
        }
      } catch (error) {
        this.logger.error(error, 'Error evaluating token');
      }
    });
  }

  async sendAlert(token) {
    try {
      const message = TelegramFormatter.formatAlert(token);

      await this.telegram.sendMessage(this.chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });

      this.logger.info(
        { token: token.metrics.address },
        'Alert sent to Telegram'
      );
    } catch (error) {
      this.logger.error(error, 'Failed to send Telegram alert');
    }
  }

  async start() {
    if (this.useOpenClaw) {
      this.logger.info('Initializing OpenClaw agent...');
      await this.openclaw.initialize();
    }
    this.logger.info('Starting four.meme alert bot');
    await this.listener.start();
  }

  async stop() {
    this.listener.stop();
    this.logger.info('Bot stopped');
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  const bot = new FourMemeAlertBot();

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nTerminated');
    await bot.stop();
    process.exit(0);
  });

  await bot.start();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
