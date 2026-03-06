/**
 * admin.consumer.js
 *
 * Consumes events from the Admin Service that require identity state changes.
 *
 * admin.account_suspended   → set User.status = SUSPENDED, revoke all sessions
 * admin.account_unsuspended → set User.status = ACTIVE
 *
 * These events are published by the Admin Service when an admin suspends
 * or unsuspends a vendor/customer through the moderation workflow.
 * The Auth Service is the single source of truth for account status,
 * so it must react to these events.
 */

import { consume }      from '../services/rabbitmq.service.js';
import { suspendAccount, unsuspendAccount } from '../services/auth.service.js';
import logger           from '../utils/logger.js';

export async function startConsumers() {
  // ── admin.account_suspended ──────────────────────────────────────────────
  // Published by Admin Service when a vendor or customer is suspended
  await consume(
    'admin.account_suspended',
    'auth-service.admin.account_suspended',
    async (payload) => {
      const { userId, reason } = payload;

      if (!userId) {
        logger.warn({ msg: 'admin.account_suspended missing userId', payload });
        return;
      }

      try {
        await suspendAccount(userId, reason ?? 'Suspended by platform admin');
        logger.info({ msg: 'Account suspended via admin event', userId });
      } catch (err) {
        // If user not found, it's a data inconsistency — log and move on
        if (err.code === 'NOT_FOUND') {
          logger.warn({ msg: 'Suspension event for unknown userId', userId });
          return;
        }
        throw err; // re-throw for nack + DLX
      }
    },
  );

  // ── admin.account_unsuspended ────────────────────────────────────────────
  await consume(
    'admin.account_unsuspended',
    'auth-service.admin.account_unsuspended',
    async (payload) => {
      const { userId } = payload;

      if (!userId) {
        logger.warn({ msg: 'admin.account_unsuspended missing userId', payload });
        return;
      }

      try {
        await unsuspendAccount(userId);
        logger.info({ msg: 'Account unsuspended via admin event', userId });
      } catch (err) {
        if (err.code === 'NOT_FOUND') {
          logger.warn({ msg: 'Unsuspend event for unknown userId', userId });
          return;
        }
        throw err;
      }
    },
  );

  logger.info('Auth consumers started');
}
