import React, { useState, useEffect } from 'react';
import {
  FiCpu,
  FiHardDrive,
  FiDatabase,
  FiServer,
  FiWifi
} from 'react-icons/fi';
import { apiClient } from '@/lib/api';

interface SystemHealthData {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number;
  memory: { used: number; total: number };
  cpu: { usage: number };
  database: { status: string; latency: number };
  redis: { status: string; latency: number };
}

export default function SystemHealth() {
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setLoading(true);
        const systemHealth = await apiClient.getSystemHealth();
        setHealth(systemHealth);
      } catch (error) {
        console.error('Failed to fetch system health:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    
    // Fetch health data every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy': return 'text-success';
      case 'warning': return 'text-warning';
      case 'critical': return 'text-error';
      default: return 'text-base-content';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy': return 'admin-badge-success';
      case 'warning': return 'admin-badge-warning';
      case 'critical': return 'admin-badge-error';
      default: return 'admin-badge';
    }
  };

  if (loading) {
    return (
      <div className="admin-card animate-pulse">
        <div className="h-4 bg-base-300 rounded mb-4"></div>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-base-300 rounded"></div>
                <div className="h-3 bg-base-300 rounded w-20"></div>
              </div>
              <div className="h-3 bg-base-300 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="admin-card">
        <div className="admin-card-header">
          <h3 className="admin-card-title">
            <FiServer className="w-5 h-5" />
            System Health
          </h3>
        </div>
        <div className="text-center py-8 text-base-content/60">
          <FiServer className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Unable to load system health</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3 className="admin-card-title">
          <FiServer className="w-5 h-5" />
          System Health
        </h3>
        <div className={`admin-badge ${getStatusBadge(health.status)}`}>
          {health.status.toUpperCase()}
        </div>
      </div>
      
      <div className="space-y-4">
        {/* Uptime */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FiServer className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Uptime</span>
          </div>
          <span className="text-sm text-base-content/70">
            {formatUptime(health.uptime)}
          </span>
        </div>

        {/* Memory Usage */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FiHardDrive className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Memory</span>
          </div>
          <div className="text-right">
            <div className="text-sm text-base-content/70">
              {((health.memory.used / health.memory.total) * 100).toFixed(1)}%
            </div>
            <div className="w-20 bg-base-300 rounded-full h-2 mt-1">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${(health.memory.used / health.memory.total) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* CPU Usage */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FiCpu className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">CPU</span>
          </div>
          <div className="text-right">
            <div className="text-sm text-base-content/70">
              {health.cpu.usage.toFixed(1)}%
            </div>
            <div className="w-20 bg-base-300 rounded-full h-2 mt-1">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${health.cpu.usage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Database */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FiDatabase className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Database</span>
          </div>
          <div className="text-right">
            <div className={`text-sm ${getStatusColor(health.database.status)}`}>
              {health.database.status}
            </div>
            <div className="text-xs text-base-content/60">
              {health.database.latency}ms
            </div>
          </div>
        </div>

        {/* Redis */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FiWifi className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Redis</span>
          </div>
          <div className="text-right">
            <div className={`text-sm ${getStatusColor(health.redis.status)}`}>
              {health.redis.status}
            </div>
            <div className="text-xs text-base-content/60">
              {health.redis.latency}ms
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

