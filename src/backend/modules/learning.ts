import { BattleTradeDB } from './database';
import { HistoricalTrade, SetupPattern, MarketRegime } from '../../shared/types';
import { PatternMatrixEntity } from '../types/db';

export interface OnlineLearningState {
  id: string;
  recent_streak_memory: number[]; // Array of 1s and 0s
  aggressiveness_multiplier: number;
  last_updated: number;
}

// Weights for Logistic Regression (SGD)
export interface ModelWeights {
  [feature: string]: number;
}

export class OnlineLearningEngine {
  private db: BattleTradeDB;
  private learningRate = 0.1;

  constructor(db: BattleTradeDB) {
    this.db = db;
    this.initLearningState();
  }

  private initLearningState() {
    try {
      const state = this.getLearningState();
      if (!state) {
        this.db.insert('online_learning_state', {
          id: 'GLOBAL_LEARNING_STATE',
          recent_streak_memory: JSON.stringify([]),
          aggressiveness_multiplier: 1.0,
          last_updated: Date.now()
        });
      }
    } catch (e) {
      console.warn("Learning state init failed", e);
    }
  }

  public getLearningState(): OnlineLearningState {
    const raw = this.db.select<any>('online_learning_state', { id: 'GLOBAL_LEARNING_STATE' })[0];
    if (raw) {
      return {
        id: raw.id,
        recent_streak_memory: JSON.parse(raw.recent_streak_memory || '[]'),
        aggressiveness_multiplier: raw.aggressiveness_multiplier || 1.0,
        last_updated: raw.last_updated
      };
    }
    return { id: 'GLOBAL_LEARNING_STATE', recent_streak_memory: [], aggressiveness_multiplier: 1.0, last_updated: Date.now() };
  }

  private saveLearningState(state: OnlineLearningState) {
    this.db.insertOrUpdate('online_learning_state', {
      id: state.id,
      recent_streak_memory: JSON.stringify(state.recent_streak_memory),
      aggressiveness_multiplier: state.aggressiveness_multiplier,
      last_updated: Date.now()
    }, 'id');
  }

  public getPattern(regime: string, setup: string): PatternMatrixEntity {
    const patternId = `${setup}_IN_${regime}`;
    let pattern = this.db.select<PatternMatrixEntity>('pattern_matrix', { pattern_id: patternId })[0];
    
    if (!pattern) {
      pattern = {
        pattern_id: patternId,
        regime,
        setup,
        win_rate: 0.5,
        expectancy: 0.0,
        trades_count: 0,
        status: 'NEUTRAL',
        last_updated: Date.now()
      };
      this.db.insertOrUpdate('pattern_matrix', pattern, 'pattern_id');
    }
    return pattern;
  }

  private savePattern(pattern: PatternMatrixEntity) {
    this.db.insertOrUpdate('pattern_matrix', pattern, 'pattern_id');
  }

  public onTradeClosed(trade: HistoricalTrade) {
    if (!trade.regimeAtEntry || !trade.setupPattern) return;

    const isWin = trade.pnlPercent > 0;
    const y = isWin ? 1 : 0;
    
    // 1. Update Streak & Aggressiveness
    const state = this.getLearningState();
    state.recent_streak_memory.push(y);
    if (state.recent_streak_memory.length > 20) {
      state.recent_streak_memory.shift();
    }
    
    // Calculate new aggressiveness based on recent win rate
    if (state.recent_streak_memory.length >= 5) {
      const wins = state.recent_streak_memory.filter(v => v === 1).length;
      const recentWinRate = wins / state.recent_streak_memory.length;
      
      if (recentWinRate >= 0.6) {
        state.aggressiveness_multiplier = Math.min(1.5, state.aggressiveness_multiplier + 0.1);
      } else if (recentWinRate <= 0.4) {
        state.aggressiveness_multiplier = Math.max(0.5, state.aggressiveness_multiplier - 0.15);
      }
    }
    this.saveLearningState(state);

    // 2. Update Pattern Matrix (Online SGD for logistic regression & expectancy)
    const pattern = this.getPattern(trade.regimeAtEntry, trade.setupPattern);
    
    // Simple incremental win rate and expectancy
    const prevTrades = pattern.trades_count;
    pattern.trades_count += 1;
    
    pattern.win_rate = ((pattern.win_rate * prevTrades) + y) / pattern.trades_count;
    
    // Calculate expectancy (Average PnL)
    const prevExpectancy = pattern.expectancy;
    pattern.expectancy = ((prevExpectancy * prevTrades) + trade.pnlPercent) / pattern.trades_count;
    
    // Update status based on statistically significant expectancy
    if (pattern.trades_count >= 3) {
      if (pattern.expectancy > 2.0) {
        pattern.status = 'PREFERRED';
      } else if (pattern.expectancy < -5.0) {
        pattern.status = 'BLOCKED';
      } else if (pattern.expectancy < -2.0) {
        pattern.status = 'PENALIZED';
      } else {
        pattern.status = 'NEUTRAL';
      }
    }
    
    pattern.last_updated = Date.now();
    this.savePattern(pattern);
    
    // 3. Log a lesson learned if status changed
    if (pattern.trades_count >= 3 && pattern.status === 'BLOCKED') {
      this.db.addAuditEvent('ONLINE_LEARNING', 'PATTERN_BLOCKED', undefined, `Pattern ${pattern.pattern_id} has negative expectancy (${pattern.expectancy.toFixed(2)}%). Temporarily blocked.`);
    } else if (pattern.trades_count >= 3 && pattern.status === 'PREFERRED') {
      this.db.addAuditEvent('ONLINE_LEARNING', 'PATTERN_PREFERRED', undefined, `Pattern ${pattern.pattern_id} shows high expectancy (${pattern.expectancy.toFixed(2)}%). Promoted to PREFERRED.`);
    }
  }

  /**
   * Applies learned penalties/bonuses to the base score and size.
   */
  public evaluateOpportunity(regime: string, setup: string, baseScore: number, baseSize: number): { score: number, sizeMultiplier: number, blocked: boolean } {
    const pattern = this.getPattern(regime, setup);
    const state = this.getLearningState();
    
    let score = baseScore;
    let sizeMultiplier = state.aggressiveness_multiplier;
    let blocked = false;

    if (pattern.trades_count >= 3) {
      if (pattern.status === 'BLOCKED') {
        blocked = true;
      } else if (pattern.status === 'PENALIZED') {
        score -= 15;
        sizeMultiplier *= 0.5; // Cut size in half
      } else if (pattern.status === 'PREFERRED') {
        score += 10;
        sizeMultiplier *= 1.25; // Increase size by 25%
      }
    }

    return { score: Math.max(0, Math.min(100, score)), sizeMultiplier, blocked };
  }
}
