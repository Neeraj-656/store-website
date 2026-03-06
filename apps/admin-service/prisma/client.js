/**
 * prisma/client.js
 *
 * Issue 3 fix — Database connection pool exhaustion
 *
 * Prisma's default pool size is: num_physical_cpus * 2 + 1.
 * On a 4-core machine that's 9 connections per replica.
 * Scale the Admin Service to 5 replicas → 45 connections.
 * Add Auth, Catalog, Vendor, Order services at similar scale and you blow
 * past PostgreSQL's default max_connections of 100, causing:
 *   "sorry, too many clients already" errors that crash requests.
 *
 * Two-part fix:
 *
 * 1. Enforce a hard per-replica connection cap via DATABASE_CONNECTION_LIMIT
 *    (default 5). Set this LOW — PgBouncer will multiplex efficiently, so a
 *    small Prisma pool is fine. Without PgBouncer, set it higher (10–20) but
 *    ensure total-replicas × limit < max_connections.
 *
 * 2. Add PgBouncer to docker-compose.yml (see that file). The DATABASE_URL
 *    in production should point to PgBouncer, NOT directly to Postgres.
 *    PgBouncer in transaction-pooling mode allows hundreds of application
 *    connections to share a small number of actual Postgres connections.
 *
 * The connection_limit is appended to the DATABASE_URL query string so it
 * is respected by Prisma's built-in connection pool.
 */

import { PrismaClient } from '@prisma/client';
import logger from '../src/utils/logger.js';

// Allow operators to tune the per-replica pool size without code changes.
// Keep this small when running behind PgBouncer (3–5 is typical).
// Raise it only if connecting directly to Postgres and you have headroom.
const CONNECTION_LIMIT = parseInt(process.env.DATABASE_CONNECTION_LIMIT ?? '5', 10);

// Append connection_limit to the DATABASE_URL.
// If the URL already has a query string this safely adds the parameter.
function buildDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Missing required env var: DATABASE_URL');

  const url = new URL(base);
  url.searchParams.set('connection_limit', String(CONNECTION_LIMIT));
  // Pool timeout: how long a query waits for a free connection before erroring.
  url.searchParams.set('pool_timeout', process.env.DATABASE_POOL_TIMEOUT ?? '10');
  return url.toString();
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: buildDatabaseUrl() },
  },
  log: [
    { level: 'warn',  emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

prisma.$on('warn',  (e) => logger.warn({ msg: 'Prisma warning', message: e.message }));
prisma.$on('error', (e) => logger.error({ msg: 'Prisma error',  message: e.message }));

export default prisma;
