/**
 * The Hive — Swarm Intelligence Engine
 *
 * Self-evolving intelligence system that scans connected estates
 * (GitHub, GitLab, Vercel, Notion, etc.), harvests documentation,
 * detects modules, identifies integration points, and continuously
 * strengthens the platform through smart merging and enhancement.
 *
 * Migrated from: server/services/theHive.ts (623 lines)
 * Zero-cost: All analysis is rule-based, no LLM API calls.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export type EstateType = 'github' | 'gitlab' | 'bitbucket' | 'vercel' | 'google_drive' | 'onedrive' | 'dropbox' | 'notion' | 'linear';
export type ScanType = 'documentation' | 'modules' | 'functions' | 'workflows' | 'pipelines' | 'automations' | 'templates' | 'ais' | 'agents' | 'bots' | 'styles' | 'designs';
export type InjectionPointType = 'direct_import' | 'api_integration' | 'workflow_merge' | 'style_adoption' | 'pattern_replication' | 'data_sync';

export interface EstateConnection {
  id: string;
  type: EstateType;
  name: string;
  url: string;
  credentials: { token?: string; apiKey?: string };
  lastScanned?: Date;
  status: 'connected' | 'disconnected' | 'scanning' | 'error';
  scanCount: number;
  createdAt: Date;
}

export interface ScannedItem {
  id: string;
  estateId: string;
  estateType: EstateType;
  scanType: ScanType;
  name: string;
  description: string;
  path: string;
  url: string;
  content?: string;
  metadata: Record<string, unknown>;
  tags: string[];
  language?: string;
  framework?: string;
  dependencies?: string[];
  scannedAt: Date;
  accuracy: number;
}

export interface InjectionPoint {
  id: string;
  sourceItemId: string;
  targetLocation: string;
  injectionType: InjectionPointType;
  description: string;
  benefits: string[];
  risks: string[];
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  priority: number;
  status: 'pending' | 'approved' | 'injected' | 'rejected';
  createdAt: Date;
}

export interface SwarmTask {
  id: string;
  type: 'scan' | 'analyze' | 'inject' | 'harvest' | 'merge';
  estateId?: string;
  scanTypes?: ScanType[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface HiveStats {
  totalEstates: number;
  connectedEstates: number;
  totalScannedItems: number;
  totalInjectionPoints: number;
  pendingInjections: number;
  completedInjections: number;
  totalTasks: number;
  completedTasks: number;
  lastActivity: Date | null;
}

// ============================================================================
// SWARM INTELLIGENCE ENGINE
// ============================================================================

export class SwarmIntelligence {
  private estates: Map<string, EstateConnection> = new Map();
  private scannedItems: Map<string, ScannedItem> = new Map();
  private injectionPoints: Map<string, InjectionPoint> = new Map();
  private tasks: Map<string, SwarmTask> = new Map();

  constructor() {
    logger.info('SwarmIntelligence initialised');
  }

  // --------------------------------------------------------------------------
  // ESTATE MANAGEMENT
  // --------------------------------------------------------------------------

  addEstate(params: Omit<EstateConnection, 'id' | 'scanCount' | 'createdAt' | 'status'>): EstateConnection {
    const estate: EstateConnection = {
      ...params,
      id: uuidv4(),
      status: 'connected',
      scanCount: 0,
      createdAt: new Date(),
    };
    this.estates.set(estate.id, estate);
    logger.info({ estateId: estate.id, type: estate.type, name: estate.name }, 'Estate connected');
    return estate;
  }

  getEstate(id: string): EstateConnection | undefined { return this.estates.get(id); }
  getEstates(): EstateConnection[] { return Array.from(this.estates.values()); }

  updateEstateStatus(id: string, status: EstateConnection['status']): void {
    const estate = this.estates.get(id);
    if (estate) { estate.status = status; }
  }

  removeEstate(id: string): boolean { return this.estates.delete(id); }

  // --------------------------------------------------------------------------
  // SCANNING
  // --------------------------------------------------------------------------

  async scanEstate(estateId: string, scanTypes?: ScanType[]): Promise<SwarmTask> {
    const estate = this.estates.get(estateId);
    if (!estate) throw new Error(`Estate ${estateId} not found`);

    const task: SwarmTask = {
      id: uuidv4(),
      type: 'scan',
      estateId,
      scanTypes: scanTypes || ['documentation', 'modules', 'agents', 'workflows'],
      status: 'running',
      progress: 0,
      createdAt: new Date(),
    };
    this.tasks.set(task.id, task);
    estate.status = 'scanning';

    try {
      const items = await this.performScan(estate, task.scanTypes!);
      for (const item of items) {
        this.scannedItems.set(item.id, item);
      }

      // Detect injection points from scanned items
      const injections = this.detectInjectionPoints(items);
      for (const inj of injections) {
        this.injectionPoints.set(inj.id, inj);
      }

      task.status = 'completed';
      task.progress = 100;
      task.result = { itemsFound: items.length, injectionPointsDetected: injections.length };
      task.completedAt = new Date();
      estate.status = 'connected';
      estate.lastScanned = new Date();
      estate.scanCount++;

      logger.info({ taskId: task.id, estateId, items: items.length, injections: injections.length }, 'Estate scan completed');
    } catch (err) {
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      estate.status = 'error';
      logger.error({ taskId: task.id, estateId, err }, 'Estate scan failed');
    }

    return task;
  }

  private async performScan(estate: EstateConnection, scanTypes: ScanType[]): Promise<ScannedItem[]> {
    // Rule-based scan simulation — in production, this would call estate APIs
    const items: ScannedItem[] = [];

    for (const scanType of scanTypes) {
      const syntheticItems = this.generateSyntheticItems(estate, scanType);
      items.push(...syntheticItems);
    }

    return items;
  }

  private generateSyntheticItems(estate: EstateConnection, scanType: ScanType): ScannedItem[] {
    const templates: Record<ScanType, Partial<ScannedItem>[]> = {
      documentation: [
        { name: 'README.md', description: 'Project documentation', language: 'markdown', accuracy: 0.95 },
        { name: 'API Reference', description: 'API documentation', language: 'markdown', accuracy: 0.9 },
      ],
      modules: [
        { name: 'Core Module', description: 'Core functionality module', language: 'typescript', accuracy: 0.85 },
      ],
      agents: [
        { name: 'AI Agent', description: 'Autonomous agent definition', language: 'typescript', accuracy: 0.8 },
      ],
      workflows: [
        { name: 'CI/CD Workflow', description: 'Automated workflow', language: 'yaml', accuracy: 0.9 },
      ],
      functions: [],
      pipelines: [],
      automations: [],
      templates: [],
      ais: [],
      bots: [],
      styles: [],
      designs: [],
    };

    return (templates[scanType] || []).map(template => ({
      id: uuidv4(),
      estateId: estate.id,
      estateType: estate.type,
      scanType,
      name: template.name || 'Unknown',
      description: template.description || '',
      path: `/${estate.name}/${scanType}/${template.name}`,
      url: `${estate.url}/${scanType}/${template.name}`,
      metadata: { estateType: estate.type, scanType },
      tags: [estate.type, scanType],
      language: template.language,
      scannedAt: new Date(),
      accuracy: template.accuracy || 0.75,
    }));
  }

  // --------------------------------------------------------------------------
  // INJECTION POINTS
  // --------------------------------------------------------------------------

  private detectInjectionPoints(items: ScannedItem[]): InjectionPoint[] {
    const injections: InjectionPoint[] = [];

    for (const item of items) {
      if (item.scanType === 'modules' || item.scanType === 'agents') {
        injections.push({
          id: uuidv4(),
          sourceItemId: item.id,
          targetLocation: 'infinity-portal',
          injectionType: 'api_integration',
          description: `Integrate ${item.name} from ${item.estateType} estate`,
          benefits: ['Enhanced functionality', 'Reduced duplication', 'Improved coverage'],
          risks: ['Dependency on external estate', 'Version compatibility'],
          effort: 'medium',
          impact: 'high',
          priority: 7,
          status: 'pending',
          createdAt: new Date(),
        });
      }

      if (item.scanType === 'documentation') {
        injections.push({
          id: uuidv4(),
          sourceItemId: item.id,
          targetLocation: 'the-library',
          injectionType: 'data_sync',
          description: `Sync ${item.name} documentation to The Library`,
          benefits: ['Centralised knowledge', 'Up-to-date docs'],
          risks: ['Sync conflicts'],
          effort: 'low',
          impact: 'medium',
          priority: 5,
          status: 'pending',
          createdAt: new Date(),
        });
      }
    }

    return injections;
  }

  approveInjection(id: string): boolean {
    const inj = this.injectionPoints.get(id);
    if (!inj || inj.status !== 'pending') return false;
    inj.status = 'approved';
    logger.info({ injectionId: id }, 'Injection point approved');
    return true;
  }

  markInjected(id: string): boolean {
    const inj = this.injectionPoints.get(id);
    if (!inj || inj.status !== 'approved') return false;
    inj.status = 'injected';
    return true;
  }

  getInjectionPoints(status?: InjectionPoint['status']): InjectionPoint[] {
    const all = Array.from(this.injectionPoints.values());
    return status ? all.filter(i => i.status === status) : all;
  }

  // --------------------------------------------------------------------------
  // QUERIES
  // --------------------------------------------------------------------------

  getScannedItems(filters?: { estateId?: string; scanType?: ScanType; language?: string }): ScannedItem[] {
    let items = Array.from(this.scannedItems.values());
    if (filters?.estateId) items = items.filter(i => i.estateId === filters.estateId);
    if (filters?.scanType) items = items.filter(i => i.scanType === filters.scanType);
    if (filters?.language) items = items.filter(i => i.language === filters.language);
    return items;
  }

  getTasks(status?: SwarmTask['status']): SwarmTask[] {
    const all = Array.from(this.tasks.values());
    return status ? all.filter(t => t.status === status) : all;
  }

  getStats(): HiveStats {
    const estates = Array.from(this.estates.values());
    const tasks = Array.from(this.tasks.values());
    const injections = Array.from(this.injectionPoints.values());
    const allTasks = [...tasks];
    const lastTask = allTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    return {
      totalEstates: estates.length,
      connectedEstates: estates.filter(e => e.status === 'connected').length,
      totalScannedItems: this.scannedItems.size,
      totalInjectionPoints: injections.length,
      pendingInjections: injections.filter(i => i.status === 'pending').length,
      completedInjections: injections.filter(i => i.status === 'injected').length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      lastActivity: lastTask?.completedAt || null,
    };
  }
}

export const swarmIntelligence = new SwarmIntelligence();