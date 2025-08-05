import React from 'react';
import { 
  FiUsers, 
  FiSmartphone, 
  FiActivity, 
  FiCheckCircle, 
  FiAlertTriangle,
  FiMessageSquare,
  FiPhone
} from 'react-icons/fi';
import { AdminStats } from '@/types/admin';

interface StatsCardsProps {
  stats: AdminStats;
}

const statItems = [
  {
    label: 'Users',
    icon: FiUsers,
    key: 'activeUsers',
    description: 'users active last 24h'
  },
  {
    label: 'Devices',
    icon: FiSmartphone,
    key: 'activeDevices',
    description: 'devices connected'
  },
  {
    label: 'Sessions',
    icon: FiActivity,
    key: 'activeSessions',
    description: 'active sessions'
  },
  {
    label: 'Security Events',
    icon: FiCheckCircle,
    key: 'securityEvents',
    description: 'events in the last 24h'
  },
  {
    label: 'Approvals Pending',
    icon: FiAlertTriangle,
    key: 'pendingApprovals',
    description: 'requests waiting for approval'
  },
  {
    label: 'Messages',
    icon: FiMessageSquare,
    key: 'messagesLastDay',
    description: 'messages sent last 24h'
  },
  {
    label: 'Call Minutes',
    icon: FiPhone,
    key: 'callMinutesLastDay',
    description: 'minutes of calls last 24h'
  }
];

export default function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statItems.map((item) => {
        const Icon = item.icon;
        const value = stats[item.key as keyof AdminStats] as number;
        
        return (
          <div key={item.key} className="admin-stat-card admin-hover-lift">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-base-content">{item.label}</h3>
                  <p className="text-xs text-base-content/60">{item.description}</p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-primary">
                {value.toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
