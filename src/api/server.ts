/**
 * The Hive — REST API Server
 * Swarm intelligence, estate scanning, injection point management
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { logger } from '../utils/logger';
import { swarmIntelligence } from '../intelligence/swarm';
import type { ScanType } from '../intelligence/swarm';


// ============================================================================
// IAM MIDDLEWARE — Trancendos 2060 Standard (TRN-PROD-001)
// ============================================================================
import { createHash, createHmac } from 'crypto';

const IAM_JWT_SECRET = process.env.IAM_JWT_SECRET || process.env.JWT_SECRET || '';
const IAM_ALGORITHM = process.env.JWT_ALGORITHM || 'HS512';
const SERVICE_ID = 'hive';
const MESH_ADDRESS = process.env.MESH_ADDRESS || 'hive.agent.local';

function sha512Audit(data: string): string {
  return createHash('sha512').update(data).digest('hex');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64 + '='.repeat((4 - b64.length % 4) % 4), 'base64').toString('utf8');
}

interface JWTClaims {
  sub: string; email?: string; role?: string;
  active_role_level?: number; permissions?: string[];
  exp?: number; jti?: string;
}

function verifyIAMToken(token: string): JWTClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const header = JSON.parse(b64urlDecode(h));
    const alg = header.alg === 'HS512' ? 'sha512' : 'sha256';
    const expected = createHmac(alg, IAM_JWT_SECRET)
      .update(`${h}.${p}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (expected !== sig) return null;
    const claims = JSON.parse(b64urlDecode(p)) as JWTClaims;
    if (claims.exp && Date.now() / 1000 > claims.exp) return null;
    return claims;
  } catch { return null; }
}

function requireIAMLevel(maxLevel: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Authentication required', service: SERVICE_ID }); return; }
    const claims = verifyIAMToken(token);
    if (!claims) { res.status(401).json({ error: 'Invalid or expired token', service: SERVICE_ID }); return; }
    const level = claims.active_role_level ?? 6;
    if (level > maxLevel) {
      console.log(JSON.stringify({ level: 'audit', decision: 'DENY', service: SERVICE_ID,
        principal: claims.sub, requiredLevel: maxLevel, actualLevel: level, path: req.path,
        integrityHash: sha512Audit(`DENY:${claims.sub}:${req.path}:${Date.now()}`),
        timestamp: new Date().toISOString() }));
      res.status(403).json({ error: 'Insufficient privilege level', required: maxLevel, actual: level });
      return;
    }
    (req as any).principal = claims;
    next();
  };
}

function iamRequestMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Service-Id', SERVICE_ID);
  res.setHeader('X-Mesh-Address', MESH_ADDRESS);
  res.setHeader('X-IAM-Version', '1.0');
  next();
}

function iamHealthStatus() {
  return {
    iam: {
      version: '1.0', algorithm: IAM_ALGORITHM,
      status: IAM_JWT_SECRET ? 'configured' : 'unconfigured',
      meshAddress: MESH_ADDRESS,
      routingProtocol: process.env.MESH_ROUTING_PROTOCOL || 'static_port',
      cryptoMigrationPath: 'hmac_sha512 → ml_kem (2030) → hybrid_pqc (2040) → slh_dsa (2060)',
    },
  };
}
// ============================================================================
// END IAM MIDDLEWARE
// ============================================================================

export function createServer(): express.Application {
  const app = express();
  app.use(helmet()); app.use(cors()); app.use(express.json({ limit: '1mb' }));
  app.use(morgan('combined', { stream: { write: (m: string) => logger.info({ http: m.trim() }, 'HTTP') } }));

  app.get('/health', (_req, res) => res.json({
    status: 'healthy', service: 'the-hive', uptime: process.uptime(),
    timestamp: new Date().toISOString(), ...swarmIntelligence.getStats(),
  }));

  app.get('/metrics', (_req, res) => {
    const mem = process.memoryUsage();
    res.json({ service: 'the-hive', uptime: process.uptime(),
      memory: { heapUsedMb: Math.round(mem.heapUsed/1024/1024), rssMb: Math.round(mem.rss/1024/1024) },
      stats: swarmIntelligence.getStats() });
  });

  // Estates
  app.get('/api/v1/estates', (_req, res) => res.json({ estates: swarmIntelligence.getEstates() }));
  app.post('/api/v1/estates', (req, res) => {
    try {
      const estate = swarmIntelligence.addEstate(req.body);
      res.status(201).json(estate);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });
  app.get('/api/v1/estates/:id', (req, res) => {
    const e = swarmIntelligence.getEstate(req.params.id);
    if (!e) return res.status(404).json({ error: 'Estate not found' });
    return res.json(e);
  });
  app.delete('/api/v1/estates/:id', (req, res) => {
    const deleted = swarmIntelligence.removeEstate(req.params.id);
    res.json({ deleted });
  });

  // Scanning
  app.post('/api/v1/estates/:id/scan', async (req, res) => {
    try {
      const { scanTypes } = req.body;
      const task = await swarmIntelligence.scanEstate(req.params.id, scanTypes as ScanType[]);
      res.status(202).json(task);
    } catch (err) { res.status(500).json({ error: String(err) }); }
  });

  // Scanned items
  app.get('/api/v1/items', (req, res) => {
    const items = swarmIntelligence.getScannedItems({
      estateId: req.query.estateId as string,
      scanType: req.query.scanType as ScanType,
      language: req.query.language as string,
    });
    res.json({ count: items.length, items });
  });

  // Injection points
  app.get('/api/v1/injections', (req, res) => {
    const injections = swarmIntelligence.getInjectionPoints(req.query.status as 'pending' | undefined);
    res.json({ count: injections.length, injections });
  });
  app.post('/api/v1/injections/:id/approve', (req, res) => {
    const ok = swarmIntelligence.approveInjection(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Injection not found or not pending' });
    return res.json({ approved: true });
  });
  app.post('/api/v1/injections/:id/inject', (req, res) => {
    const ok = swarmIntelligence.markInjected(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Injection not found or not approved' });
    return res.json({ injected: true });
  });

  // Tasks
  app.get('/api/v1/tasks', (req, res) => {
    const tasks = swarmIntelligence.getTasks(req.query.status as 'queued' | undefined);
    res.json({ count: tasks.length, tasks });
  });

  // Stats
  app.get('/api/v1/stats', (_req, res) => res.json(swarmIntelligence.getStats()));


// ═══════════════════════════════════════════════════════════════════════════════
// 2060 SMART RESILIENCE LAYER — Auto-wired by Trancendos Compliance Engine
// ═══════════════════════════════════════════════════════════════════════════════
import {
  SmartTelemetry,
  SmartEventBus,
  SmartCircuitBreaker,
  telemetryMiddleware,
  adaptiveRateLimitMiddleware,
  createHealthEndpoint,
  setupGracefulShutdown,
} from '../middleware/resilience-layer';

// Initialize 2060 singletons
const telemetry2060 = SmartTelemetry.getInstance();
const eventBus2060 = SmartEventBus.getInstance();
const circuitBreaker2060 = new SmartCircuitBreaker(`${SERVICE_ID}-primary`, {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 3,
});

// Wire telemetry middleware (request tracking + trace propagation)
app.use(telemetryMiddleware);

// Wire adaptive rate limiting (IAM-level aware)
app.use(adaptiveRateLimitMiddleware);

// 2060 Enhanced health endpoint with resilience status
app.get('/health/2060', createHealthEndpoint({
  serviceName: SERVICE_ID,
  meshAddress: MESH_ADDRESS,
  getCustomHealth: () => ({
    circuitBreaker: circuitBreaker2060.getState(),
    eventBusListeners: eventBus2060.listenerCount(),
    telemetryMetrics: telemetry2060.getMetricNames().length,
  }),
}));

// Prometheus text format metrics export
app.get('/metrics/prometheus', (_req: any, res: any) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(telemetry2060.exportPrometheus());
});

// Emit service lifecycle events
eventBus2060.emit('service.2060.wired', {
  serviceId: SERVICE_ID,
  meshAddress: MESH_ADDRESS,
  timestamp: new Date().toISOString(),
  features: ['telemetry', 'rate-limiting', 'circuit-breaker', 'event-bus', 'prometheus-export'],
});

// ═══════════════════════════════════════════════════════════════════════════════
// END 2060 SMART RESILIENCE LAYER
// ═══════════════════════════════════════════════════════════════════════════════

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: err.message });
  });
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}