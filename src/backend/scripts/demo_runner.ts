/**
 * CLI DEMO RUNNER SCRIPT — BATTLE TRADE
 * Módulo CLI ejecutable para gestionar comandos de la Demo Autónoma de 7 Días.
 *
 * Uso:
 *   npx tsx src/backend/scripts/demo_runner.ts run
 *   npx tsx src/backend/scripts/demo_runner.ts stop
 *   npx tsx src/backend/scripts/demo_runner.ts reset
 *   npx tsx src/backend/scripts/demo_runner.ts export-report
 *   npx tsx src/backend/scripts/demo_runner.ts export-dataset
 */

import { BattleTradeDB } from '../modules/database';
import { Demo7DManager } from '../modules/demo_7d';
import { HardeningEngine } from '../modules/hardening';

async function main() {
  const command = process.argv[2] || 'status';
  const db = new BattleTradeDB();
  const demoManager = new Demo7DManager(db);

  console.log(`\n======================================================`);
  console.log(`⚡ BATTLE TRADE — DEMO RUNNER CLI [Command: ${command}]`);
  console.log(`======================================================\n`);

  switch (command) {
    case 'run':
    case 'start': {
      const config = demoManager.startDemo();
      console.log(`✅ Demo Autónoma de 7 días INICIADA exitosamente.`);
      console.log(`   Modo: ${config.mode}`);
      console.log(`   Capital Inicial: $${config.startingCapitalUsd.toFixed(2)} USD`);
      console.log(`   Cadenas Activas: ${config.enabledChains.join(', ')}`);
      console.log(`   Inicio: ${new Date(config.startTimestamp).toISOString()}`);
      console.log(`   Fin Programado: ${new Date(config.endTimestamp).toISOString()}`);
      break;
    }

    case 'stop':
    case 'pause': {
      const config = demoManager.stopDemo();
      console.log(`⏸️ Demo Autónoma PAUSADA. Las entradas están detenidas.`);
      break;
    }

    case 'reset': {
      demoManager.resetPaperDemo();
      console.log(`🔄 Base de datos de simulación y capital reseteados a $1,000.00 USD.`);
      break;
    }

    case 'export-report':
    case 'report': {
      const result = demoManager.exportScorecardReport();
      console.log(`📄 Scorecard de 7 días exportado exitosamente:`);
      console.log(`   Markdown Report: ${result.mdPath}`);
      console.log(`   JSON Report: ${result.jsonPath}`);
      console.log(`   Capital Final: $${result.scorecard.capitalAndPnl.endingCapitalUsd.toFixed(2)} USD`);
      console.log(`   PnL Neto: $${result.scorecard.capitalAndPnl.totalPnlUsd.toFixed(2)} USD (${result.scorecard.capitalAndPnl.roiPercent.toFixed(2)}%)`);
      console.log(`   Win Rate: ${result.scorecard.tradingEdgeMetrics.winRatePercent.toFixed(1)}%`);
      console.log(`   Robustness Score: ${result.scorecard.robustnessScore.score}/100 (${result.scorecard.robustnessScore.rating})`);
      break;
    }

    case 'export-dataset':
    case 'dataset': {
      const result = demoManager.exportTradeDataset();
      console.log(`📊 Dataset de trades exportado exitosamente:`);
      console.log(`   JSON Dataset: ${result.jsonPath}`);
      console.log(`   CSV Dataset: ${result.csvPath}`);
      console.log(`   Total Registros: ${result.count}`);
      break;
    }

    case 'status':
    default: {
      const scorecard = demoManager.generate7DayScorecard();
      console.log(`📊 ESTADO ACTUAL DE LA DEMO (Día ${scorecard.demoOverview.elapsedDays.toFixed(1)}/7):`);
      console.log(`   Completado: ${scorecard.demoOverview.completionPercent.toFixed(1)}%`);
      console.log(`   Capital Actual: $${scorecard.capitalAndPnl.endingCapitalUsd.toFixed(2)} USD`);
      console.log(`   PnL Acumulado: $${scorecard.capitalAndPnl.totalPnlUsd.toFixed(2)} USD (${scorecard.capitalAndPnl.roiPercent.toFixed(2)}%)`);
      console.log(`   Max Drawdown: ${scorecard.capitalAndPnl.maxDrawdownPercent.toFixed(2)}%`);
      console.log(`   Total Trades: ${scorecard.tradingEdgeMetrics.totalTrades} (Win Rate: ${scorecard.tradingEdgeMetrics.winRatePercent.toFixed(1)}%)`);
      console.log(`   Profit Factor: ${scorecard.tradingEdgeMetrics.profitFactor.toFixed(2)}`);
      break;
    }
  }

  console.log(`\n======================================================\n`);
}

main().catch(err => {
  console.error(`❌ Error ejecutando comando demo: ${err.message}`);
  process.exit(1);
});
