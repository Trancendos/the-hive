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

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: err.message });
  });
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}