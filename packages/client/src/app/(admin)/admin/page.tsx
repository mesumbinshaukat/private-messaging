'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { AdminStats, Analytics } from '@/types/admin';
import StatsCards from '@/components/admin/dashboard/StatsCards';
import AnalyticsCharts from '@/components/admin/dashboard/AnalyticsCharts';
import RecentActivity from '@/components/admin/dashboard/RecentActivity';
import SystemHealth from '@/components/admin/dashboard/SystemHealth';
import PendingActions from '@/components/admin/dashboard/PendingActions';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'day' | 'week' | 'month'>('week');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsData, analyticsData] = await Promise.all([
          apiClient.getAdminStats(),
          apiClient.getAnalytics(timeframe)
        ]);
        
        setStats(statsData);
        setAnalytics(analyticsData);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [timeframe]);

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold admin-gradient-text">SuperAdmin Dashboard</h1>
          <p className="text-base-content/70 mt-2">System overview and analytics</p>
        </div>
        
        <div className="grid gap-6">
          {/* Loading Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="admin-stat-card animate-pulse">
                <div className="h-4 bg-base-300 rounded mb-2"></div>
                <div className="h-8 bg-base-300 rounded mb-1"></div>
                <div className="h-3 bg-base-300 rounded w-2/3"></div>
              </div>
            ))}
          </div>

          {/* Loading Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="admin-card animate-pulse">
                <div className="h-6 bg-base-300 rounded mb-4"></div>
                <div className="h-64 bg-base-300 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold admin-gradient-text">SuperAdmin Dashboard</h1>
            <p className="text-base-content/70 mt-2">
              System overview and analytics • Last updated: {new Date().toLocaleTimeString()}
            </p>
          </div>
          
          {/* Timeframe Selector */}
          <div className="mt-4 sm:mt-0">
            <div className="tabs tabs-boxed">
              {(['day', 'week', 'month'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimeframe(period)}
                  className={`tab ${timeframe === period ? 'tab-active' : ''}`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Stats Overview */}
        {stats && <StatsCards stats={stats} />}

        {/* System Health & Pending Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SystemHealth />
          <PendingActions />
        </div>

        {/* Analytics Charts */}
        {analytics && <AnalyticsCharts analytics={analytics} timeframe={timeframe} />}

        {/* Recent Activity */}
        <RecentActivity />
      </div>
    </div>
  );
}
