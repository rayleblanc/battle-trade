import { MarketRegime } from '../../shared/types';
import { FeatureTimeframe, FeatureVector } from './features';

export type MLHorizon = '5m' | '15m' | '30m' | '1h';

export interface MLFeatureExtractionInput {
  featureVector: FeatureVector;
  regime: MarketRegime;
  securityScore: number; // 0 to 100
  liquidityScore: number; // 0 to 100
}

export interface MLModelArtifact {
  model_id: string;
  model_name: string;
  model_type: 'logistic_regression' | 'boosted_trees' | 'ensemble';
  model_version: string;
  feature_schema_version: string;
  horizon: MLHorizon;
  created_at: number;
  feature_names: string[];
  // Logistic regression parameters
  weights?: number[];
  bias?: number;
  // Boosted tree ensemble parameters
  trees?: MLDecisionTree[];
  learning_rate?: number;
  base_score?: number;
  // Probability calibration (Platt scaling: 1 / (1 + exp(A * logit + B)))
  calibration: {
    method: 'platt' | 'isotonic_bins';
    platt_a: number;
    platt_b: number;
    reliability_bins?: { min_prob: number; max_prob: number; calibrated_val: number }[];
  };
  performance_metrics?: {
    brier_score: number;
    log_loss: number;
    auc_roc: number;
    sample_count: number;
  };
}

export interface MLDecisionTree {
  feature_index: number;
  threshold: number;
  left_val?: number;
  right_val?: number;
  left_child?: MLDecisionTree;
  right_child?: MLDecisionTree;
}

export interface MLExpectedValueBreakdown {
  p_win: number;
  p_loss: number;
  reward_percent: number;
  loss_percent: number;
  gross_ev_percent: number;
  costs: {
    fees_percent: number;
    slippage_percent: number;
    gas_percent: number;
    price_impact_percent: number;
    latency_cost_percent: number;
    total_cost_percent: number;
    total_cost_bps: number;
  };
  net_ev_percent: number;
  net_ev_per_dollar: number; // Net EV per $1 traded
  ev_over_risk: number; // EV/R
  is_positive_ev: boolean;
}

export interface MLInferenceResult {
  token_address: string;
  chain_id: string;
  horizon: MLHorizon;
  timestamp: number;
  model_version: string;
  feature_version: string;
  data_quality: number; // 0.0 to 1.0 (confidence * freshness)

  // Multi-target outputs
  p_tp_before_sl: number; // Primary win probability P(TP before SL)
  model_probability: number; // Raw model output before calibration
  calibrated_probability: number; // After Platt scaling / isotonic calibration
  expected_return_percent: number; // Expected return for the selected horizon
  expected_adverse_excursion_percent: number; // MAE expected (negative number, e.g. -2.1%)
  prob_significant_loss: number; // P(loss > 1.5 * SL or sudden liquidity dump)

  // Expected Value
  expected_value: MLExpectedValueBreakdown;

  // Signal suggestion
  recommended_action: 'STRONG_BUY' | 'BUY' | 'NEUTRAL_PASS' | 'NO_TRADE';
  action_reason: string;
}

export interface MLTrainingSample {
  sample_id: string;
  timestamp: number;
  token_address: string;
  chain_id: string;
  horizon: MLHorizon;
  features: number[];
  feature_names: string[];
  regime: MarketRegime;
  security_score: number;
  liquidity_score: number;

  // Realized outcomes when trade completes
  outcome?: {
    resolved_timestamp: number;
    hit_tp: boolean; // y label for P(TP before SL)
    hit_sl: boolean;
    realized_return_percent: number;
    realized_mae_percent: number;
    significant_loss_occurred: boolean;
  };
}

export interface ChampionChallengerStatus {
  champion_model_id: string;
  champion_version: string;
  challenger_model_id: string;
  challenger_version: string;
  champion_brier_score: number;
  challenger_brier_score: number;
  total_eval_samples: number;
  challenger_leads_by_samples: number;
  last_promotion_timestamp?: number;
  last_rollback_timestamp?: number;
  status: 'CHAMPION_ACTIVE' | 'CHALLENGER_TESTING' | 'PROMOTION_PENDING' | 'ROLLED_BACK';
}
