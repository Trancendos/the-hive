/**
 * The Hive — Heartbeat Aggregation System
 *
 * Collects, aggregates, and visualizes heartbeat signals from all
 * connected services in the Trancendos ecosystem. Provides real-time
 * health monitoring and predictive maintenance capabilities.
 *
 * Architecture: Trancendos Industry 6.0 / 2060 Standard
 * P1.3 Action: Add heartbeat aggregation to The Hive
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type ServiceStatus = 'healthy' | 'degraded' | 'critical' | 'offline' | 'unknown';
export type HealthCategory = 'availability' | 'performance' | 'errors' | 'resources' | 'dependencies';

export interface Heartbeat {
  id: string;
  serviceId: string;
  serviceName: string;
  timestamp: Date;
  status: ServiceStatus;
  category: HealthCategory;
  metrics: {
    uptime: number; // seconds
    responseTime: number; // milliseconds
    errorRate: number; // percentage (0-100)
    cpuUsage: number; // percentage (0-100)
    memoryUsage: number; // percentage (0-100)
    diskUsage: number; // percentage (0-100)
    activeConnections: number;
    requestsPerMinute: number;
  };
  metadata: {
    version?: string;
    environment?: string;
    region?: string;
    lastRestart?: Date;
    [key: string]: unknown;
  };
  tags: string[];
}

export interface AggregatedHealth {
  timestamp: Date;
  overallStatus: ServiceStatus;
  overallScore: number; // 0-100
  services: ServiceHealth[];
  categories: CategoryHealth[];
  trends: HealthTrend[];
  alerts: HealthAlert[];
  recommendations: string[];
}

export interface ServiceHealth {
  serviceId: string;
  serviceName: string;
  status: ServiceStatus;
  score: number; // 0-100
  lastHeartbeat: Date;
  heartbeatInterval: number; // seconds
  missedHeartbeats: number;
  currentMetrics: Heartbeat['metrics'];
  historicalMetrics: Heartbeat['metrics'][];
  statusHistory: Array<{ timestamp: Date; status: ServiceStatus }>;
  incidents: HealthIncident[];
}

export interface CategoryHealth {
  category: HealthCategory;
  status: ServiceStatus;
  score: number;
  affectedServices: string[];
  averageMetrics: {
    responseTime: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
  };
}

export interface HealthTrend {
  period: '1h' | '6h' | '24h' | '7d' | '30d';
  status: 'improving' | 'stable' | 'degrading';
  scoreChange: number;
  keyMetrics: {
    avgResponseTime: number;
    avgErrorRate: number;
    avgUptime: number;
  };
}

export interface HealthAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: HealthCategory;
  serviceId: string;
  serviceName: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface HealthIncident {
  id: string;
  serviceId: string;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'resolved';
  severity: ServiceStatus;
  description: string;
  affectedMetrics: string[];
}

export interface HeartbeatConfig {
  retentionPeriod: number; // seconds to keep heartbeat history
  aggregationInterval: number; // seconds between aggregations
  alertThresholds: {
    criticalResponseTime: number; // ms
    criticalErrorRate: number; // percentage
    criticalCpuUsage: number; // percentage
    criticalMemoryUsage: number; // percentage
    warningResponseTime: number; // ms
    warningErrorRate: number; // percentage
    warningCpuUsage: number; // percentage
    warningMemoryUsage: number; // percentage
  };
}

// ============================================================================
// HEARTBEAT AGGREGATOR
// ============================================================================

export class HeartbeatAggregator {
  private heartbeats: Map<string, Heartbeat[]> = new Map();
  private serviceHealth: Map<string, ServiceHealth> = new Map();
  private alerts: HealthAlert[] = [];
  private incidents: HealthIncident[] = new Map();
  private config: HeartbeatConfig;
  private lastAggregation: Date | null = null;

  constructor(config?: Partial<HeartbeatConfig>) {
    this.config = {
      retentionPeriod: 3600 * 24 * 7, // 7 days
      aggregationInterval: 60, // 1 minute
      alertThresholds: {
        criticalResponseTime: 5000,
        criticalErrorRate: 10,
        criticalCpuUsage: 90,
        criticalMemoryUsage: 90,
        warningResponseTime: 2000,
        warningErrorRate: 5,
        warningCpuUsage: 75,
        warningMemoryUsage: 75,
      },
      ...config,
    };
    logger.info('HeartbeatAggregator initialized');
  }

  // ───── Heartbeat Ingestion ───────────────────────────────────────────────

  receiveHeartbeat(heartbeat: Heartbeat): void {
    // Store heartbeat
    if (!this.heartbeats.has(heartbeat.serviceId)) {
      this.heartbeats.set(heartbeat.serviceId, []);
    }
    
    const heartbeats = this.heartbeats.get(heartbeat.serviceId)!;
    heartbeats.push(heartbeat);

    // Clean up old heartbeats based on retention period
    this.cleanupHeartbeats(heartbeat.serviceId);

    // Update service health
    this.updateServiceHealth(heartbeat);

    // Check for alerts
    this.checkAlerts(heartbeat);

    logger.debug({
      serviceId: heartbeat.serviceId,
      status: heartbeat.status,
      score: this.calculateServiceScore(heartbeat),
    }, 'Heartbeat received');
  }

  private cleanupHeartbeats(serviceId: string): void {
    const heartbeats = this.heartbeats.get(serviceId);
    if (!heartbeats) return;

    const cutoff = Date.now() - (this.config.retentionPeriod * 1000);
    const cleaned = heartbeats.filter(hb => hb.timestamp.getTime() > cutoff);
    this.heartbeats.set(serviceId, cleaned);
  }

  // ───── Service Health Calculation ─────────────────────────────────────────

  private updateServiceHealth(heartbeat: Heartbeat): void {
    let serviceHealth = this.serviceHealth.get(heartbeat.serviceId);

    if (!serviceHealth) {
      // Initialize service health
      serviceHealth = {
        serviceId: heartbeat.serviceId,
        serviceName: heartbeat.serviceName,
        status: heartbeat.status,
        score: this.calculateServiceScore(heartbeat),
        lastHeartbeat: heartbeat.timestamp,
        heartbeatInterval: 60, // Default, will be adjusted
        missedHeartbeats: 0,
        currentMetrics: heartbeat.metrics,
        historicalMetrics: [heartbeat.metrics],
        statusHistory: [{ timestamp: heartbeat.timestamp, status: heartbeat.status }],
        incidents: [],
      };
      this.serviceHealth.set(heartbeat.serviceId, serviceHealth);
    } else {
      // Update existing service health
      const now = Date.now();
      const timeSinceLastHeartbeat = (now - serviceHealth.lastHeartbeat.getTime()) / 1000;

      // Detect missed heartbeats
      if (timeSinceLastHeartbeat > serviceHealth.heartbeatInterval * 2) {
        serviceHealth.missedHeartbeats++;
      } else {
        serviceHealth.missedHeartbeats = 0;
      }

      // Update heartbeat interval based on actual data
      if (serviceHealth.lastHeartbeat) {
        const newInterval = (now - serviceHealth.lastHeartbeat.getTime()) / 1000;
        // Smooth average
        serviceHealth.heartbeatInterval = (serviceHealth.heartbeatInterval * 0.9) + (newInterval * 0.1);
      }

      // Update metrics
      serviceHealth.currentMetrics = heartbeat.metrics;
      serviceHealth.historicalMetrics.push(heartbeat.metrics);
      
      // Keep only last 1000 metrics
      if (serviceHealth.historicalMetrics.length > 1000) {
        serviceHealth.historicalMetrics = serviceHealth.historicalMetrics.slice(-1000);
      }

      // Update status history
      serviceHealth.statusHistory.push({ timestamp: heartbeat.timestamp, status: heartbeat.status });
      if (serviceHealth.statusHistory.length > 100) {
        serviceHealth.statusHistory = serviceHealth.statusHistory.slice(-100);
      }

      // Recalculate status and score
      serviceHealth.status = heartbeat.status;
      serviceHealth.score = this.calculateServiceScore(heartbeat);
      serviceHealth.lastHeartbeat = heartbeat.timestamp;

      // Check for incident start/end
      this.checkIncidents(serviceHealth, heartbeat);
    }
  }

  private calculateServiceScore(heartbeat: Heartbeat): number {
    const metrics = heartbeat.metrics;
    const thresholds = this.config.alertThresholds;

    let score = 100;

    // Response time score
    if (metrics.responseTime > thresholds.criticalResponseTime) {
      score -= 30;
    } else if (metrics.responseTime > thresholds.warningResponseTime) {
      score -= 10;
    }

    // Error rate score
    if (metrics.errorRate > thresholds.criticalErrorRate) {
      score -= 40;
    } else if (metrics.errorRate > thresholds.warningErrorRate) {
      score -= 15;
    }

    // CPU usage score
    if (metrics.cpuUsage > thresholds.criticalCpuUsage) {
      score -= 20;
    } else if (metrics.cpuUsage > thresholds.warningCpuUsage) {
      score -= 5;
    }

    // Memory usage score
    if (metrics.memoryUsage > thresholds.criticalMemoryUsage) {
      score -= 20;
    } else if (metrics.memoryUsage > thresholds.warningMemoryUsage) {
      score -= 5;
    }

    // Uptime score
    const uptimeHours = metrics.uptime / 3600;
    if (uptimeHours < 1) {
      score -= 10;
    } else if (uptimeHours < 24) {
      score -= 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private checkIncidents(serviceHealth: ServiceHealth, heartbeat: Heartbeat): void {
    const wasCritical = serviceHealth.statusHistory.length > 1 &&
      serviceHealth.statusHistory[serviceHealth.statusHistory.length - 2].status === 'critical';
    const isCritical = heartbeat.status === 'critical';

    // Start new incident
    if (isCritical && !wasCritical) {
      const incident: HealthIncident = {
        id: uuidv4(),
        serviceId: serviceHealth.serviceId,
        startTime: heartbeat.timestamp,
        status: 'active',
        severity: 'critical',
        description: `Service ${serviceHealth.serviceName} entered critical state`,
        affectedMetrics: this.getAffectedMetrics(heartbeat),
      };
      this.incidents.set(incident.id, incident);
      serviceHealth.incidents.push(incident);
      logger.warn({ incidentId: incident.id, serviceId: serviceHealth.serviceId }, 'Critical incident started');
    }

    // End incident
    if (!isCritical && wasCritical) {
      const activeIncidents = serviceHealth.incidents.filter(i => i.status === 'active');
      for (const incident of activeIncidents) {
        incident.endTime = heartbeat.timestamp;
        incident.status = 'resolved';
        logger.info({ incidentId: incident.id, serviceId: serviceHealth.serviceId }, 'Critical incident resolved');
      }
    }
  }

  private getAffectedMetrics(heartbeat: Heartbeat): string[] {
    const metrics: string[] = [];
    const thresholds = this.config.alertThresholds;

    if (heartbeat.metrics.responseTime > thresholds.criticalResponseTime) {
      metrics.push('responseTime');
    }
    if (heartbeat.metrics.errorRate > thresholds.criticalErrorRate) {
      metrics.push('errorRate');
    }
    if (heartbeat.metrics.cpuUsage > thresholds.criticalCpuUsage) {
      metrics.push('cpuUsage');
    }
    if (heartbeat.metrics.memoryUsage > thresholds.criticalMemoryUsage) {
      metrics.push('memoryUsage');
    }

    return metrics;
  }

  // ───── Alert Generation ───────────────────────────────────────────────────

  private checkAlerts(heartbeat: Heartbeat): void {
    const thresholds = this.config.alertThresholds;
    const metrics = heartbeat.metrics;

    // Critical alerts
    if (metrics.responseTime > thresholds.criticalResponseTime) {
      this.createAlert('critical', 'availability', heartbeat.serviceId, heartbeat.serviceName,
        `Critical response time: ${metrics.responseTime}ms`, heartbeat.timestamp);
    }
    if (metrics.errorRate > thresholds.criticalErrorRate) {
      this.createAlert('critical', 'errors', heartbeat.serviceId, heartbeat.serviceName,
        `Critical error rate: ${metrics.errorRate}%`, heartbeat.timestamp);
    }
    if (metrics.cpuUsage > thresholds.criticalCpuUsage) {
      this.createAlert('critical', 'resources', heartbeat.serviceId, heartbeat.serviceName,
        `Critical CPU usage: ${metrics.cpuUsage}%`, heartbeat.timestamp);
    }
    if (metrics.memoryUsage > thresholds.criticalMemoryUsage) {
      this.createAlert('critical', 'resources', heartbeat.serviceId, heartbeat.serviceName,
        `Critical memory usage: ${metrics.memoryUsage}%`, heartbeat.timestamp);
    }

    // Warning alerts
    if (metrics.responseTime > thresholds.warningResponseTime && metrics.responseTime <= thresholds.criticalResponseTime) {
      this.createAlert('warning', 'performance', heartbeat.serviceId, heartbeat.serviceName,
        `High response time: ${metrics.responseTime}ms`, heartbeat.timestamp);
    }
    if (metrics.errorRate > thresholds.warningErrorRate && metrics.errorRate <= thresholds.criticalErrorRate) {
      this.createAlert('warning', 'errors', heartbeat.serviceId, heartbeat.serviceName,
        `High error rate: ${metrics.errorRate}%`, heartbeat.timestamp);
    }
    if (metrics.cpuUsage > thresholds.warningCpuUsage && metrics.cpuUsage <= thresholds.criticalCpuUsage) {
      this.createAlert('warning', 'resources', heartbeat.serviceId, heartbeat.serviceName,
        `High CPU usage: ${metrics.cpuUsage}%`, heartbeat.timestamp);
    }
    if (metrics.memoryUsage > thresholds.warningMemoryUsage && metrics.memoryUsage <= thresholds.criticalMemoryUsage) {
      this.createAlert('warning', 'resources', heartbeat.serviceId, heartbeat.serviceName,
        `High memory usage: ${metrics.memoryUsage}%`, heartbeat.timestamp);
    }
  }

  private createAlert(
    severity: HealthAlert['severity'],
    category: HealthCategory,
    serviceId: string,
    serviceName: string,
    message: string,
    timestamp: Date
  ): void {
    // Check for duplicate recent alert
    const recentAlert = this.alerts.find(a =>
      a.serviceId === serviceId &&
      a.category === category &&
      a.severity === severity &&
      !a.resolved &&
      (Date.now() - a.timestamp.getTime()) < 300000 // 5 minutes
    );

    if (recentAlert) {
      return; // Don't create duplicate alert
    }

    const alert: HealthAlert = {
      id: uuidv4(),
      severity,
      category,
      serviceId,
      serviceName,
      message,
      timestamp,
      resolved: false,
    };

    this.alerts.push(alert);
    logger.warn({ alertId: alert.id, serviceId, severity, message }, 'Health alert created');
  }

  // ───── Aggregation ────────────────────────────────────────────────────────

  aggregateHealth(): AggregatedHealth {
    const services = Array.from(this.serviceHealth.values());
    const categories = this.aggregateCategories(services);
    const overallStatus = this.calculateOverallStatus(services);
    const overallScore = services.length > 0
      ? services.reduce((sum, s) => sum + s.score, 0) / services.length
      : 100;
    const trends = this.calculateTrends(services);
    const activeAlerts = this.alerts.filter(a => !a.resolved);
    const recommendations = this.generateRecommendations(services, categories);

    this.lastAggregation = new Date();

    return {
      timestamp: this.lastAggregation,
      overallStatus,
      overallScore: Math.round(overallScore),
      services,
      categories,
      trends,
      alerts: activeAlerts,
      recommendations,
    };
  }

  private aggregateCategories(services: ServiceHealth[]): CategoryHealth[] {
    const categoryMap = new Map<HealthCategory, ServiceHealth[]>();

    for (const service of services) {
      for (const category of this.getCategoriesForService(service)) {
        if (!categoryMap.has(category)) {
          categoryMap.set(category, []);
        }
        categoryMap.get(category)!.push(service);
      }
    }

    return Array.from(categoryMap.entries()).map(([category, categoryServices]) => {
      const avgResponseTime = categoryServices.reduce((sum, s) => sum + s.currentMetrics.responseTime, 0) / categoryServices.length;
      const avgErrorRate = categoryServices.reduce((sum, s) => sum + s.currentMetrics.errorRate, 0) / categoryServices.length;
      const avgCpuUsage = categoryServices.reduce((sum, s) => sum + s.currentMetrics.cpuUsage, 0) / categoryServices.length;
      const avgMemoryUsage = categoryServices.reduce((sum, s) => sum + s.currentMetrics.memoryUsage, 0) / categoryServices.length;
      const avgScore = categoryServices.reduce((sum, s) => sum + s.score, 0) / categoryServices.length;

      const status: ServiceStatus = avgScore >= 80 ? 'healthy' : avgScore >= 50 ? 'degraded' : 'critical';

      return {
        category,
        status,
        score: Math.round(avgScore),
        affectedServices: categoryServices.map(s => s.serviceId),
        averageMetrics: {
          responseTime: Math.round(avgResponseTime),
          errorRate: Math.round(avgErrorRate),
          cpuUsage: Math.round(avgCpuUsage),
          memoryUsage: Math.round(avgMemoryUsage),
        },
      };
    });
  }

  private getCategoriesForService(service: ServiceHealth): HealthCategory[] {
    const categories: HealthCategory[] = ['availability', 'performance', 'errors', 'resources'];
    
    // Add dependencies if service has active connections
    if (service.currentMetrics.activeConnections > 0) {
      categories.push('dependencies');
    }

    return categories;
  }

  private calculateOverallStatus(services: ServiceHealth[]): ServiceStatus {
    if (services.length === 0) return 'unknown';

    const criticalCount = services.filter(s => s.status === 'critical').length;
    const degradedCount = services.filter(s => s.status === 'degraded').length;
    const offlineCount = services.filter(s => s.status === 'offline').length;

    if (criticalCount > 0 || offlineCount > 0) return 'critical';
    if (degradedCount > 0) return 'degraded';
    return 'healthy';
  }

  private calculateTrends(services: ServiceHealth[]): HealthTrend[] {
    const periods: Array<HealthTrend['period']> = ['1h', '6h', '24h', '7d', '30d'];
    
    return periods.map(period => {
      const periodMs = this.getPeriodMs(period);
      const now = Date.now();
      const cutoff = now - periodMs;

      // Calculate average metrics for the period
      const allMetrics = services.flatMap(s =>
        s.historicalMetrics.filter((_, i) => {
          // Simplified: use last N metrics based on period
          const heartbeatTime = s.lastHeartbeat.getTime() - (s.historicalMetrics.length - 1 - i) * s.heartbeatInterval * 1000;
          return heartbeatTime > cutoff;
        })
      );

      const avgResponseTime = allMetrics.length > 0
        ? allMetrics.reduce((sum, m) => sum + m.responseTime, 0) / allMetrics.length
        : 0;
      const avgErrorRate = allMetrics.length > 0
        ? allMetrics.reduce((sum, m) => sum + m.errorRate, 0) / allMetrics.length
        : 0;
      const avgUptime = services.length > 0
        ? services.reduce((sum, s) => sum + s.currentMetrics.uptime, 0) / services.length
        : 0;

      // Determine trend status
      const currentScore = services.reduce((sum, s) => sum + s.score, 0) / services.length;
      const status: HealthTrend['status'] = currentScore >= 80 ? 'stable' : currentScore >= 50 ? 'degrading' : 'improving';

      return {
        period,
        status,
        scoreChange: 0, // Would need historical score data
        keyMetrics: {
          avgResponseTime: Math.round(avgResponseTime),
          avgErrorRate: Math.round(avgErrorRate),
          avgUptime: Math.round(avgUptime),
        },
      };
    });
  }

  private getPeriodMs(period: HealthTrend['period']): number {
    const multipliers: Record<HealthTrend['period'], number> = {
      '1h': 3600 * 1000,
      '6h': 3600 * 6 * 1000,
      '24h': 3600 * 24 * 1000,
      '7d': 3600 * 24 * 7 * 1000,
      '30d': 3600 * 24 * 30 * 1000,
    };
    return multipliers[period];
  }

  private generateRecommendations(services: ServiceHealth[], categories: CategoryHealth[]): string[] {
    const recommendations: string[] = [];

    // Service-level recommendations
    for (const service of services) {
      if (service.status === 'critical') {
        recommendations.push(`🚨 ${service.serviceName}: Investigate immediately - service in critical state`);
      } else if (service.status === 'degraded') {
        recommendations.push(`⚠️ ${service.serviceName}: Review metrics and investigate performance issues`);
      }

      if (service.missedHeartbeats > 3) {
        recommendations.push(`🔌 ${service.serviceName}: Check connectivity - missed ${service.missedHeartbeats} heartbeats`);
      }

      if (service.currentMetrics.cpuUsage > 80) {
        recommendations.push(`💻 ${service.serviceName}: High CPU usage (${service.currentMetrics.cpuUsage}%) - consider scaling`);
      }

      if (service.currentMetrics.memoryUsage > 80) {
        recommendations.push(`🧠 ${service.serviceName}: High memory usage (${service.currentMetrics.memoryUsage}%) - check for leaks`);
      }
    }

    // Category-level recommendations
    for (const category of categories) {
      if (category.status === 'critical') {
        recommendations.push(`🚨 Category ${category.category}: Critical - all affected services need attention`);
      }

      if (category.averageMetrics.responseTime > 2000) {
        recommendations.push(`⏱️ ${category.category}: High response times detected - optimize queries or add caching`);
      }

      if (category.averageMetrics.errorRate > 5) {
        recommendations.push(`🐛 ${category.category}: Elevated error rates - review logs and fix bugs`);
      }
    }

    return recommendations.slice(0, 10); // Limit to top 10 recommendations
  }

  // ───── Public API ────────────────────────────────────────────────────────

  getServiceHealth(serviceId: string): ServiceHealth | undefined {
    return this.serviceHealth.get(serviceId);
  }

  getAllServiceHealth(): ServiceHealth[] {
    return Array.from(this.serviceHealth.values());
  }

  getAlerts(serviceId?: string, resolved?: boolean): HealthAlert[] {
    let alerts = this.alerts;
    
    if (serviceId) {
      alerts = alerts.filter(a => a.serviceId === serviceId);
    }
    
    if (resolved !== undefined) {
      alerts = alerts.filter(a => a.resolved === resolved);
    }

    return alerts;
  }

  resolveAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      logger.info({ alertId }, 'Alert resolved');
    }
  }

  getActiveIncidents(): HealthIncident[] {
    return Array.from(this.incidents.values()).filter(i => i.status === 'active');
  }

  getStats(): {
    totalServices: number;
    healthyServices: number;
    degradedServices: number;
    criticalServices: number;
    offlineServices: number;
    totalAlerts: number;
    activeAlerts: number;
    activeIncidents: number;
  } {
    const services = Array.from(this.serviceHealth.values());
    
    return {
      totalServices: services.length,
      healthyServices: services.filter(s => s.status === 'healthy').length,
      degradedServices: services.filter(s => s.status === 'degraded').length,
      criticalServices: services.filter(s => s.status === 'critical').length,
      offlineServices: services.filter(s => s.status === 'offline').length,
      totalAlerts: this.alerts.length,
      activeAlerts: this.alerts.filter(a => !a.resolved).length,
      activeIncidents: this.getActiveIncidents().length,
    };
  }
}

// Singleton
export const heartbeatAggregator = new HeartbeatAggregator();