import { useEffect, useState } from 'react';
import { 
  FiShield, 
  FiLoader, 
  FiActivity,
  FiUserCheck,
  FiRefreshCw
} from 'react-icons/fi';
import { apiClient } from '@/lib/api';
import { AuditLog } from '@/types/admin';

export default function RecentActivity() {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const recentLogs = await apiClient.getAuditLogs(1, 5, { category: 'auth' });
      setLogs(recentLogs.logs);
    } catch (error) {
      console.error('Failed to fetch recent activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('login')) return FiActivity;
    if (action.includes('security')) return FiShield;
    if (action.includes('user')) return FiUserCheck;
    return FiRefreshCw;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-error';
      case 'warning': return 'text-warning';
      case 'error': return 'text-error';
      default: return 'text-info';
    }
  };

  if (loading) {
    return (
      <div className="admin-card animate-pulse">
        <div className="h-4 bg-base-300 rounded mb-4"></div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 bg-base-300 rounded-full"></div>
              <div className="flex-1">
                <div className="h-3 bg-base-300 rounded mb-2"></div>
                <div className="h-2 bg-base-300 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3 className="admin-card-title">
          <FiActivity className="w-5 h-5" />
          Recent Activity
        </h3>
        <button className="admin-btn-secondary btn-sm">
          View All
        </button>
      </div>
      
      <div className="space-y-3">
        {logs && logs.length > 0 ? (
          logs.map((log) => {
            const ActionIcon = getActionIcon(log.action);
            return (
              <div key={log._id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-base-300/50 transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-base-300 ${getSeverityColor(log.severity)}`}>
                  <ActionIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-base-content truncate">
                    {log.details.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`admin-badge ${getSeverityColor(log.severity)} text-xs`}>
                      {log.severity}
                    </span>
                    <span className="text-xs text-base-content/60">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-base-content/60">
            <FiActivity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
          </div>
        )}
      </div>
    </div>
  );
}
