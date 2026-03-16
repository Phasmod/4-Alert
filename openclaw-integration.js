import { EventEmitter } from 'events';

/**
 * OpenClaw Smart Filter Agent
 * Advanced ML-based token filtering
 */
class OpenClawFilterAgent extends EventEmitter {
  constructor(logger, agentId) {
    super();
    this.logger = logger;
    this.agentId = agentId;
    this.openclaw = null;
    this.tokenCache = new Map();
    this.lastFilterTime = new Map();
    this.filterCooldown = 5000; // 5s cooldown per token
    this.isInitialized = false;
  }

  /**
   * Initialize OpenClaw connection
   */
  async initialize() {
    try {
      const openclaw = await import('@openclaw/sdk');
      this.openclaw = new openclaw.OpenClaw();
      await this.openclaw.initialize();
      this.isInitialized = true;
      this.logger.info({ agentId: this.agentId }, 'OpenClaw initialized successfully');
    } catch (error) {
      this.logger.warn(
        { error: error.message },
        'OpenClaw not available - using basic filtering only'
      );
      this.isInitialized = false;
    }
  }

  /**
   * Evaluate token using OpenClaw agent pipeline
   */
  async evaluateWithAgent(metrics) {
    if (!this.isInitialized || !this.openclaw) {
      return null; // Fall back to basic filtering
    }

    // Cache check - prevent duplicate alerts
    if (this.tokenCache.has(metrics.address)) {
      const cached = this.tokenCache.get(metrics.address);
      const age = Date.now() - (this.lastFilterTime.get(metrics.address) || 0);

      if (age < this.filterCooldown) {
        this.logger.debug(
          { address: metrics.address },
          'Using cached evaluation (cooldown active)'
        );
        return null;
      }
    }

    // Store in cache
    this.tokenCache.set(metrics.address, metrics);
    this.lastFilterTime.set(metrics.address, Date.now());

    try {
      // Run OpenClaw agent pipeline
      const agentResponse = await this.openclaw.runAgent(this.agentId, {
        token: {
          address: metrics.address,
          name: metrics.name,
          symbol: metrics.symbol,
          marketCap: metrics.marketCap.toString(),
          liquidity: metrics.liquidity.toString(),
          volume: metrics.volume.toString(),
          buys: metrics.buys,
          sells: metrics.sells,
          bondingProgress: metrics.bondingProgress,
          age: Date.now() - metrics.createdAt,
        },
      });

      if (!agentResponse.pass) {
        this.logger.debug(
          { address: metrics.address, reason: agentResponse.reason },
          'Agent rejected token'
        );
        return null;
      }

      const score = agentResponse.score || 50;
      const reasoning = agentResponse.reasoning || [];
      const alerts = agentResponse.alerts || [];

      // Add OpenClaw-specific insights
      if (agentResponse.riskFlags?.length > 0) {
        alerts.push(`⚠️ Risk: ${agentResponse.riskFlags.join(', ')}`);
      }

      if (agentResponse.opportunity) {
        alerts.push(`💡 ${agentResponse.opportunity}`);
      }

      this.logger.info(
        {
          address: metrics.address,
          score,
          agentInsights: agentResponse.insights,
        },
        'Agent evaluation passed'
      );

      return {
        metrics,
        score,
        reasoning,
        alerts,
      };
    } catch (error) {
      this.logger.error(
        { error: error.message, address: metrics.address },
        'OpenClaw agent evaluation failed'
      );
      return null;
    }
  }

  /**
   * Get agent status & stats
   */
  async getAgentStatus() {
    return {
      agentId: this.agentId,
      isInitialized: this.isInitialized,
      tokensCached: this.tokenCache.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Clear cache for memory management
   */
  clearCache() {
    const size = this.tokenCache.size;
    this.tokenCache.clear();
    this.lastFilterTime.clear();
    this.logger.info({ cleared: size }, 'Agent cache cleared');
  }
}

/**
 * Risk Assessment Module
 * Identifies red flags and rug pull indicators
 */
class RiskAssessor {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Assess token for common red flags
   */
  assessRisks(metrics) {
    const flags = [];
    let riskScore = 0;

    // Extreme buy ratio (>90% = pump signal)
    const totalTrades = metrics.buys + metrics.sells;
    if (totalTrades > 0) {
      const buyRatio = metrics.buys / totalTrades;
      if (buyRatio > 0.9) {
        flags.push('Extreme buy pressure (>90%)');
        riskScore += 20;
      }
    }

    // Very low volume relative to liquidity
    if (metrics.liquidity > 0n && metrics.volume > 0n) {
      const volRatio = Number(metrics.volume) / Number(metrics.liquidity);
      if (volRatio < 0.01) {
        flags.push('Low volume relative to liquidity');
        riskScore += 15;
      }
    }

    // Very fast bonding completion
    if (metrics.bondingProgress > 99) {
      flags.push('Bonding near-complete (presale advantage)');
      riskScore += 10;
    }

    // No trades yet
    if (metrics.buys === 0 && metrics.sells === 0) {
      flags.push('No trading activity yet');
      riskScore += 5;
    }

    // Single large holder concentration
    if (metrics.holder) {
      flags.push('Monitor holder concentration');
      riskScore += 5;
    }

    const severity =
      riskScore > 60 ? 'critical' :
      riskScore > 40 ? 'high' :
      riskScore > 20 ? 'medium' : 'low';

    this.logger.debug(
      { address: metrics.address, riskScore, flags, severity },
      'Risk assessment complete'
    );

    return { riskScore, flags, severity };
  }
}

/**
 * Hybrid Filter Agent
 * Combines basic rules + OpenClaw ML for maximum coverage
 */
class HybridFilterAgent {
  constructor(logger, basicFilter, agentFilter, agentWeight = 0.6) {
    this.logger = logger;
    this.basicFilter = basicFilter;
    this.agentFilter = agentFilter;
    this.agentWeight = agentWeight; // 60% trust OpenClaw, 40% basic
    this.riskAssessor = new RiskAssessor(logger);
  }

  /**
   * Evaluate token using both systems
   */
  async evaluate(metrics) {
    // Try agent evaluation first if initialized
    if (this.agentFilter.isInitialized) {
      const agentResult = await this.agentFilter.evaluateWithAgent(metrics);
      if (agentResult) {
        // Add risk assessment
        const risks = this.riskAssessor.assessRisks(metrics);
        if (risks.severity === 'critical') {
          this.logger.warn({ address: metrics.address }, 'Token blocked: critical risk');
          return null;
        }
        if (risks.flags.length > 0) {
          agentResult.alerts.push(`⚠️ Risk Level: ${risks.severity}`);
        }
        return agentResult;
      }
    }

    // Fall back to basic filtering
    const basicResult = await this.basicFilter.evaluate(metrics);
    if (basicResult) {
      // Add risk assessment
      const risks = this.riskAssessor.assessRisks(metrics);
      if (risks.severity === 'critical') {
        this.logger.warn({ address: metrics.address }, 'Token blocked: critical risk');
        return null;
      }
      if (risks.flags.length > 0) {
        basicResult.alerts.push(`⚠️ Risk Level: ${risks.severity}`);
      }
    }
    return basicResult;
  }
}

export { OpenClawFilterAgent, RiskAssessor, HybridFilterAgent };
