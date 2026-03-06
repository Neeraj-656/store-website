/**
 * escrow-release.worker.js
 *
 * Runs on a schedule (every hour by default).
 * Finds escrow holds whose releaseAfter has passed and
 * moves them from pendingBalance → availableBalance.
 */

import { releaseMaturedEscrowHolds } from '../services/earnings.service.js';
import logger from '../utils/logger.js';

const RELEASE_INTERVAL_MS = parseInt(process.env.ESCROW_RELEASE_INTERVAL_MS ?? String(60 * 60 * 1000), 10); // 1 hour

async function runRelease() {
  try {
    const count = await releaseMaturedEscrowHolds(100);
    if (count > 0) {
      logger.info({ msg: 'Escrow release worker: released holds', count });
    }
  } catch (err) {
    logger.error({ msg: 'Escrow release worker: error', err });
  }
}

export function startEscrowReleaseWorker() {
  logger.info({ msg: 'Escrow release worker started', intervalMs: RELEASE_INTERVAL_MS });
  // Run once on startup in case of restarts with pending holds
  runRelease();
  setInterval(runRelease, RELEASE_INTERVAL_MS);
}
