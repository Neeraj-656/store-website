#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║           VERDANT MARKET — Global Service Orchestrator              ║
 * ║                                                                      ║
 * ║  Reads each service's real .env PORT at startup, builds correct     ║
 * ║  localhost URLs, and injects them into every child process so that  ║
 * ║  Docker Compose hostnames (auth-service, catalog-service …) are     ║
 * ║  never used when running outside Docker.                            ║
 * ║                                                                      ║
 * ║  Startup order (phases run sequentially, within a phase: parallel): ║
 * ║    Phase 1 — authService, catalogService                            ║
 * ║    Phase 2 — inventoryService, orderService, paymentService         ║
 * ║    Phase 3 — reviewService, vendorService, payoutService,           ║
 * ║              adminService, notificationService                      ║
 * ║    Phase 4 — apiGateway (needs auth public-key endpoint live)       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   node index.js                        # start everything
 *   node index.js --only authService,apiGateway
 *   node index.js --skip notificationService
 *   node index.js --health               # health-check already-running services
 *   node index.js --list                 # print resolved service table and exit
 *
 * Env knobs (set before running):
 *   STARTUP_TIMEOUT_MS=30000   per-service HTTP readiness timeout
 *   STARTUP_DELAY_MS=1500      pause between phases
 *   FAIL_FAST=true             abort on first failure
 *   LOG_LEVEL=info             verbose | info | error
 */

import { spawn }           from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve, join }   from 'path';
import http                from 'http';
import readline            from 'readline';

// ── ANSI colours ──────────────────────────────────────────────────────────────
const C = {
  reset:   '\x1b[0m',  bold:    '\x1b[1m',  dim:     '\x1b[2m',
  green:   '\x1b[32m', yellow:  '\x1b[33m', red:     '\x1b[31m',
  cyan:    '\x1b[36m', blue:    '\x1b[34m', magenta: '\x1b[35m',
  white:   '\x1b[37m', gray:    '\x1b[90m',
};

// ── Runtime config ────────────────────────────────────────────────────────────
const STARTUP_TIMEOUT_MS = parseInt(process.env.STARTUP_TIMEOUT_MS || '30000', 10);
const STARTUP_DELAY_MS   = parseInt(process.env.STARTUP_DELAY_MS   || '1500',  10);
const FAIL_FAST          = process.env.FAIL_FAST !== 'false';
const LOG_LEVEL          = process.env.LOG_LEVEL  || 'info';
const ROOT               = process.cwd();

// ── Parse a .env file into a plain object (no side effects) ──────────────────
// We do NOT call dotenv here — we just read the file ourselves so we can
// inspect PORT values without polluting the orchestrator's own process.env.
function parseEnvFile(filePath) {
  const result = {};
  if (!existsSync(filePath)) return result;
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val    = line.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    result[key] = val;
  }
  return result;
}

// ── Resolve the actual PORT a service will listen on ─────────────────────────
// Priority: process.env PORT override → .env file → fallback default
function resolvePort(svcDir, fallback) {
  // 1. Try .env in the service directory
  const envFile = resolve(ROOT, svcDir, '.env');
  const parsed  = parseEnvFile(envFile);
  const raw     = parsed['PORT'] || parsed['port'];
  if (raw && !isNaN(parseInt(raw, 10))) return parseInt(raw, 10);
  return fallback;
}

// ── Service definitions ───────────────────────────────────────────────────────
// `port` here is the FALLBACK used only when the service's .env has no PORT.
// The real port is resolved at startup by reading the actual .env file.
// `gatewayEnvKey` is the env-var name the gateway uses to reach this service.

const SERVICE_DEFS = [
  // Phase 1 ── Core
  { name: 'authService',        dir: 'auth-service',         entry: 'src/index.js',  phase: 1, fallbackPort: 3002, gatewayEnvKey: 'AUTH_SERVICE_URL',      healthPath: '/api/v1/auth/health', color: C.green,   description: 'JWT authority & user management'         },
  { name: 'catalogService',     dir: 'catalog-service',     entry: 'src/app.js',    phase: 1, fallbackPort: 3003, gatewayEnvKey: 'CATALOG_SERVICE_URL',   healthPath: '/live',              color: C.cyan,    description: 'Product catalogue & SKU management'      },
  // Phase 2 ── Transactional
  { name: 'inventoryService',   dir: 'inventory-service',    entry: 'src/server.js', phase: 2, fallbackPort: 3004, gatewayEnvKey: 'INVENTORY_SERVICE_URL', healthPath: '/health',            color: C.blue,    description: 'Stock reservation & deduction'           },
  { name: 'orderService',       dir: 'order-service',       entry: 'server.js',     phase: 2, fallbackPort: 3006, gatewayEnvKey: 'ORDER_SERVICE_URL',     healthPath: '/health',            color: C.magenta, description: 'Order state machine & idempotency'        },
  { name: 'paymentService',     dir: 'payment-service',     entry: 'src/index.js',  phase: 2, fallbackPort: 3007, gatewayEnvKey: 'PAYMENT_SERVICE_URL',   healthPath: '/health',            color: C.yellow,  description: 'Razorpay integration & webhooks'         },
  // Phase 3 ── Post-transaction
  { name: 'reviewService',      dir: 'review-service',      entry: 'src/index.js',  phase: 3, fallbackPort: 3009, gatewayEnvKey: 'REVIEW_SERVICE_URL',    healthPath: '/health',            color: C.cyan,    description: 'Product ratings & moderation'            },
  { name: 'vendorService',      dir: 'vendor-service',      entry: 'src/index.js',  phase: 3, fallbackPort: 3010, gatewayEnvKey: 'VENDOR_SERVICE_URL',    healthPath: '/health',            color: C.green,   description: 'KYC workflow & vendor profiles'          },
  { name: 'payoutService',      dir: 'payout-service',       entry: 'src/index.js',  phase: 3, fallbackPort: 3008, gatewayEnvKey: 'PAYOUT_SERVICE_URL',    healthPath: '/health',            color: C.blue,    description: 'Escrow, ledger & vendor payouts'         },
  { name: 'adminService',       dir: 'admin-service',        entry: 'src/index.js',  phase: 3, fallbackPort: 3001, gatewayEnvKey: 'ADMIN_SERVICE_URL',     healthPath: '/api/v1/admin/health',color: C.red,    description: 'Platform governance & moderation'        },
  { name: 'notificationService',dir: 'notification-service',entry: 'src/index.js',  phase: 3, fallbackPort: null, gatewayEnvKey: null,                    healthPath: null,                 color: C.gray,    description: 'Email / SMS / push worker (no HTTP)'     },
  // Phase 4 ── Gateway (must be last)
  { name: 'apiGateway',         dir: 'api-gateway',         entry: 'src/index.js',  phase: 4, fallbackPort: 8080, gatewayEnvKey: null,                    healthPath: '/health',            color: C.white,   description: 'Single entry-point — JWT verify + proxy' },
];

// ── Resolve real ports from .env files ────────────────────────────────────────
// Build a map of  serviceName → actualPort  by reading each service's .env.
// This runs synchronously before anything is spawned.
function buildServiceRegistry(defs) {
  return defs.map((def) => {
    const port = def.fallbackPort !== null
      ? resolvePort(def.dir, def.fallbackPort)
      : null;
    return { ...def, port };
  });
}

// ── Build gateway URL overrides from real ports ───────────────────────────────
// Returns an object like { AUTH_SERVICE_URL: 'http://localhost:3002', ... }
// which we inject into every spawned child so Docker hostnames are never used.
function buildLocalhostOverrides(services) {
  const overrides = {};
  for (const svc of services) {
    if (svc.gatewayEnvKey && svc.port) {
      overrides[svc.gatewayEnvKey] = `http://localhost:${svc.port}`;
    }
  }
  // Also override common broker/infra Docker hostnames
  const globalEnv = {
    REDIS_URL:   process.env.REDIS_URL   || 'redis://localhost:6379',
    REDIS_HOST:  process.env.REDIS_HOST  || 'localhost',
    RABBITMQ_URL:process.env.RABBITMQ_URL|| 'amqp://localhost:5672',
    AMQP_URL:    process.env.AMQP_URL    || 'amqp://localhost:5672',
  };
  return { ...overrides, ...globalEnv };
}

// ── Logging ───────────────────────────────────────────────────────────────────
const ts = () => new Date().toTimeString().slice(0, 8);

function log(level, color, name, msg) {
  if (level === 'verbose' && LOG_LEVEL !== 'verbose') return;
  const icon = level === 'error' ? `${C.red}✖${C.reset}` :
               level === 'warn'  ? `${C.yellow}⚠${C.reset}` :
               level === 'ok'    ? `${C.green}✔${C.reset}` :
                                   `${C.blue}›${C.reset}`;
  const label = name ? `${color}${name.padEnd(22)}${C.reset}` : ''.padEnd(22);
  console.log(`${C.gray}${ts()}${C.reset} ${icon} ${label} ${msg}`);
}

function banner() {
  console.log(`
${C.green}${C.bold}╔══════════════════════════════════════════════════════╗
║       🌿  Verdant Market — Service Orchestrator       ║
╚══════════════════════════════════════════════════════╝${C.reset}
`);
}

function printTable(services) {
  console.log(`${C.bold}  Service Registry  ${C.dim}(ports resolved from each service's .env)${C.reset}\n`);
  console.log(`  ${'Name'.padEnd(24)} ${'Dir'.padEnd(24)} ${'Port'.padEnd(8)} Phase`);
  console.log(`  ${'─'.repeat(64)}`);
  for (const s of services) {
    const port = s.port ? String(s.port) : 'worker';
    console.log(
      `  ${s.color}${s.name.padEnd(24)}${C.reset}` +
      ` ${C.dim}${s.dir.padEnd(24)}${C.reset}` +
      ` ${port.padEnd(8)} ${s.phase}  ${C.dim}${s.description}${C.reset}`
    );
  }
  console.log();
}

// ── Argument parsing ──────────────────────────────────────────────────────────
function parseArgs() {
  const args  = process.argv.slice(2);
  const flags = { only: null, skip: [], health: false, list: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--only'   && args[i+1]) { flags.only = args[++i].split(','); }
    if (args[i] === '--skip'   && args[i+1]) { flags.skip = args[++i].split(','); }
    if (args[i] === '--health') flags.health = true;
    if (args[i] === '--list')   flags.list   = true;
  }
  return flags;
}

// ── Pre-flight directory check ────────────────────────────────────────────────
function checkDirectories(services) {
  const missing = [];
  for (const svc of services) {
    const dir   = resolve(ROOT, svc.dir);
    const entry = join(dir, svc.entry);
    if (!existsSync(dir))   missing.push({ svc, reason: `directory missing: ${dir}` });
    else if (!existsSync(entry)) missing.push({ svc, reason: `entry missing: ${entry}` });
  }
  return missing;
}

// ── HTTP health poller ────────────────────────────────────────────────────────
function pollHealth({ name, port, healthPath }, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt  = () => {
      const req = http.request(
        { hostname: 'localhost', port, path: healthPath, method: 'GET', timeout: 2500 },
        (res) => {
          if (res.statusCode >= 200 && res.statusCode < 500) resolve();
          else retry(`HTTP ${res.statusCode}`);
          res.resume();
        },
      );
      req.on('error',   (e) => retry(e.message));
      req.on('timeout', ()  => { req.destroy(); retry('socket timeout'); });
      req.end();
    };
    const retry = (reason) => {
      if (Date.now() + 900 > deadline) {
        reject(new Error(`readiness timeout after ${timeoutMs/1000}s — last error: ${reason}`));
      } else {
        setTimeout(attempt, 900);
      }
    };
    attempt();
  });
}

// ── Spawn one service ─────────────────────────────────────────────────────────
function spawnService(svc, localhostOverrides) {
  const cwd   = resolve(ROOT, svc.dir);

  // Merge order:
  //   process.env (orchestrator's inherited env — contains real secrets)
  //   → localhostOverrides (replaces Docker hostnames with localhost:PORT)
  //   → svc.extraEnv (per-service last-word overrides, if any)
  //
  // Because dotenv inside each service uses `import 'dotenv/config'` which
  // does NOT override already-set env vars, our injected values always win
  // over whatever Docker hostnames are in the service's own .env file.
  const env = {
    ...process.env,
    ...localhostOverrides,
    ...(svc.extraEnv || {}),
  };

  const child = spawn('node', [svc.entry], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env });

  const prefix = `${C.gray}${ts()}${C.reset}   ${svc.color}${svc.name.padEnd(22)}${C.reset} `;

  // Keep a rolling buffer of the last 20 lines from this service so we can
  // include them in timeout/crash error messages even at non-verbose log levels.
  const recentLines = [];
  const pushLine = (line) => { recentLines.push(line); if (recentLines.length > 20) recentLines.shift(); };

  const pipeStream = (stream, isErr) => {
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      pushLine(line);
      // Always print stderr (errors must be visible at any log level).
      // Print stdout in info mode too — services log their own startup status.
      // Only suppress stdout in 'error' mode.
      if (isErr || LOG_LEVEL !== 'error') {
        const colour = isErr ? C.red : C.dim;
        process.stdout.write(`${prefix}${colour}${line}${C.reset}\n`);
      }
    });
  };

  pipeStream(child.stdout, false);
  pipeStream(child.stderr, true);

  // Attach the buffer to the child so startService can read it on failure
  child._recentLines = recentLines;

  return child;
}

// ── Start one service and wait for it to be ready ─────────────────────────────
async function startService(svc, localhostOverrides) {
  log('info', svc.color, svc.name, `Starting…  ${C.dim}${svc.description}${C.reset}`);

  const child = spawnService(svc, localhostOverrides);
  let died = false, exitCode = null;
  child.on('exit', (code) => { died = true; exitCode = code; });

  // Worker-only (no HTTP health check)
  if (!svc.port || !svc.healthPath) {
    await new Promise((r) => setTimeout(r, 1500));
    if (died) throw new Error(`exited with code ${exitCode} before becoming ready`);
    log('ok', svc.color, svc.name, `${C.green}Running${C.reset}  ${C.dim}pid ${child.pid} — worker, no HTTP${C.reset}`);
    return child;
  }

  // Poll HTTP health endpoint
  try {
    await pollHealth(svc, STARTUP_TIMEOUT_MS);
  } catch (err) {
    if (!died) child.kill('SIGTERM');
    const tail = child._recentLines?.slice(-8).join('\n    ') || '(no output captured)';
    throw new Error(`${err.message}\n\n  Last output from ${svc.name}:\n    ${tail}\n`);
  }
  if (died) {
    const tail = child._recentLines?.slice(-8).join('\n    ') || '(no output)';
    throw new Error(`exited with code ${exitCode} during health check\n\n  Last output:\n    ${tail}\n`);
  }

  log('ok', svc.color, svc.name, `${C.green}Ready${C.reset}    ${C.dim}:${svc.port}  pid ${child.pid}${C.reset}`);
  return child;
}

// ── Health-check mode ─────────────────────────────────────────────────────────
async function runHealthChecks(services) {
  console.log(`\n${C.bold}  Running health checks…${C.reset}\n`);
  let ok = true;
  for (const svc of services) {
    if (!svc.port || !svc.healthPath) {
      log('info', svc.color, svc.name, `${C.gray}worker — skipped${C.reset}`); continue;
    }
    try {
      await pollHealth(svc, 5000);
      log('ok',    svc.color, svc.name, `${C.green}Healthy${C.reset}  :${svc.port}`);
    } catch {
      log('error', svc.color, svc.name, `${C.red}Unreachable${C.reset}  :${svc.port}`);
      ok = false;
    }
  }
  console.log();
  if (!ok) { console.log(`${C.red}${C.bold}  ✖ One or more services unreachable${C.reset}\n`); process.exit(1); }
  console.log(`${C.green}${C.bold}  ✔ All services healthy${C.reset}\n`);
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function setupShutdown(children) {
  let down = false;
  const shutdown = (sig) => {
    if (down) return;
    down = true;
    console.log(`\n${C.yellow}${C.bold}  ${sig} — stopping services (reverse order)…${C.reset}\n`);
    const rev = [...children].reverse();
    for (const { svc, child } of rev) {
      if (child && !child.killed) {
        log('info', svc.color, svc.name, 'SIGTERM →');
        child.kill('SIGTERM');
      }
    }
    const force = setTimeout(() => { for (const { child } of rev) { if (child && !child.killed) child.kill('SIGKILL'); } process.exit(1); }, 12_000);
    force.unref();
    Promise.all(rev.map(({ child }) => new Promise((r) => { if (!child || child.exitCode !== null) return r(); child.once('exit', r); }))).then(() => {
      console.log(`\n${C.green}  All services stopped.${C.reset}\n`);
      clearTimeout(force); process.exit(0);
    });
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  banner();
  const flags = parseArgs();

  // ── Resolve real ports by reading each service's .env file ────────────────
  const SERVICES = buildServiceRegistry(SERVICE_DEFS);

  if (flags.list) { printTable(SERVICES); process.exit(0); }

  // ── Filter by --only / --skip ─────────────────────────────────────────────
  let services = [...SERVICES];
  if (flags.only) {
    services = services.filter((s) => flags.only.includes(s.name));
    if (!services.length) { console.error(`${C.red}  --only matched nothing: ${flags.only.join(', ')}${C.reset}`); process.exit(1); }
  }
  if (flags.skip.length) services = services.filter((s) => !flags.skip.includes(s.name));

  if (flags.health) { await runHealthChecks(services); return; }

  // ── Pre-flight ────────────────────────────────────────────────────────────
  console.log(`${C.bold}  Pre-flight checks…${C.reset}\n`);
  const missing = checkDirectories(services);
  if (missing.length) {
    for (const { svc, reason } of missing) log('error', svc.color, svc.name, `${C.red}${reason}${C.reset}`);
    console.log(`\n${C.red}  Fix missing paths then re-run.${C.reset}\n`);
    process.exit(1);
  }
  log('ok', C.green, 'preflight', `All ${services.length} service directories present`);

  // ── Build localhost URL overrides from REAL ports ─────────────────────────
  const localhostOverrides = buildLocalhostOverrides(SERVICES);

  // Log what we resolved so it's easy to debug
  console.log(`\n${C.bold}  Resolved service URLs ${C.dim}(injected into every child process)${C.reset}\n`);
  for (const [key, val] of Object.entries(localhostOverrides)) {
    if (key.endsWith('_URL') && key !== 'REDIS_URL' && key !== 'RABBITMQ_URL' && key !== 'AMQP_URL') {
      console.log(`    ${C.dim}${key.padEnd(26)}${C.reset} ${C.green}${val}${C.reset}`);
    }
  }
  console.log();

  printTable(services);

  // ── Group into phases ─────────────────────────────────────────────────────
  const phases = {};
  for (const s of services) (phases[s.phase] = phases[s.phase] || []).push(s);

  const allChildren = [];
  const failed      = [];
  const phaseLabels = { 1: 'Phase 1 — Core', 2: 'Phase 2 — Transactional', 3: 'Phase 3 — Post-transaction', 4: 'Phase 4 — Gateway' };

  for (const phase of Object.keys(phases).sort()) {
    const group = phases[phase];
    console.log(`\n${C.bold}  ─── ${phaseLabels[phase] || `Phase ${phase}`} ${'─'.repeat(30)}${C.reset}\n`);

    const results = await Promise.allSettled(
      group.map(async (svc) => ({ svc, child: await startService(svc, localhostOverrides) }))
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        allChildren.push(result.value);
      } else {
        const svc = group[i];
        log('error', svc?.color || C.red, svc?.name || '?',
          `${C.red}Failed: ${result.reason?.message || result.reason}${C.reset}`);
        failed.push(svc?.name || '?');
        if (FAIL_FAST) {
          console.log(`\n${C.red}${C.bold}  FAIL_FAST — aborting.${C.reset}\n`);
          for (const { child } of allChildren) { if (child && !child.killed) child.kill('SIGTERM'); }
          process.exit(1);
        }
      }
    }

    if (parseInt(phase) < Math.max(...Object.keys(phases).map(Number))) {
      await new Promise((r) => setTimeout(r, STARTUP_DELAY_MS));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}  ─── Startup Summary ${'─'.repeat(36)}${C.reset}\n`);
  for (const { svc } of allChildren) {
    log('ok', svc.color, svc.name, `${C.green}${svc.port ? `:${svc.port}` : 'worker'}${C.reset}  ${C.dim}${svc.description}${C.reset}`);
  }
  for (const name of failed) log('error', C.red, name, `${C.red}Did not start${C.reset}`);
  console.log();
  if (!failed.length) {
    console.log(`${C.green}${C.bold}  ✔ All ${allChildren.length} services started${C.reset}`);
    const gw = SERVICES.find((s) => s.name === 'apiGateway');
    console.log(`${C.dim}  API Gateway → http://localhost:${gw?.port || 8080}/api/v1${C.reset}\n`);
  } else {
    console.log(`${C.yellow}${C.bold}  ⚠ ${allChildren.length}/${services.length} started  (failed: ${failed.join(', ')})${C.reset}\n`);
  }

  setupShutdown(allChildren);

  // Auto-restart crashed services
  for (const entry of allChildren) {
    const { svc, child } = entry;
    child.on('exit', (code, signal) => {
      if (signal === 'SIGTERM' || signal === 'SIGKILL') return;
      log('warn', svc.color, svc.name, `${C.yellow}Crashed (code ${code}) — restarting in 3s…${C.reset}`);
      setTimeout(async () => {
        try {
          entry.child = await startService(svc, localhostOverrides);
        } catch (err) {
          log('error', svc.color, svc.name, `${C.red}Restart failed: ${err.message}${C.reset}`);
        }
      }, 3000);
    });
  }
}

main().catch((err) => {
  console.error(`\n${C.red}${C.bold}  Fatal: ${err.message}${C.reset}\n`);
  process.exit(1);
});