'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  FiHome, 
  FiUsers, 
  FiSmartphone, 
  FiActivity, 
  FiShield, 
  FiBarChart3, 
  FiSettings,
  FiCheckCircle,
  FiAlertTriangle,
  FiMessageSquare,
  FiPhone,
  FiMonitor
} from 'react-icons/fi';

const navigationItems = [
  {
    name: 'Dashboard',
    href: '/admin',
    icon: FiHome,
    description: 'Overview and statistics'
  },
  {
    name: 'User Management',
    href: '/admin/users',
    icon: FiUsers,
    description: 'Manage users and roles'
  },
  {
    name: 'Device Management',
    href: '/admin/devices',
    icon: FiSmartphone,
    description: 'Monitor and control devices'
  },
  {
    name: 'Pending Approvals',
    href: '/admin/approvals',
    icon: FiCheckCircle,
    description: 'User and device approvals'
  },
  {
    name: 'Sessions',
    href: '/admin/sessions',
    icon: FiActivity,
    description: 'Active sessions and tokens'
  },
  {
    name: 'Analytics',
    href: '/admin/analytics',
    icon: FiBarChart3,
    description: 'Messages, calls and metrics'
  },
  {
    name: 'Audit Logs',
    href: '/admin/audit',
    icon: FiShield,
    description: 'Security and system logs'
  },
  {
    name: 'System Health',
    href: '/admin/system',
    icon: FiMonitor,
    description: 'Server and infrastructure'
  },
  {
    name: 'Settings',
    href: '/admin/settings',
    icon: FiSettings,
    description: 'Admin configuration'
  }
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="admin-drawer-side w-64 min-h-full">
      <div className="admin-menu">
        {/* Logo */}
        <div className="mb-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-admin-light-gold flex items-center justify-center">
              <FiShield className="w-6 h-6 text-primary-content" />
            </div>
            <div>
              <h1 className="text-lg font-bold admin-gradient-text">SuperAdmin</h1>
              <p className="text-xs text-base-content/60">Control Panel</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ul className="space-y-2">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`
                    admin-menu-item flex items-center gap-3 p-3 rounded-lg transition-all duration-200
                    ${isActive 
                      ? 'active bg-primary text-primary-content shadow-lg' 
                      : 'hover:bg-base-300 text-base-content'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary-content' : 'text-primary'}`} />
                  <div className="flex-1">
                    <div className={`font-medium ${isActive ? 'text-primary-content' : 'text-base-content'}`}>
                      {item.name}
                    </div>
                    <div className={`text-xs ${isActive ? 'text-primary-content/80' : 'text-base-content/60'}`}>
                      {item.description}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Quick Stats */}
        <div className="mt-8 p-4 bg-base-300 rounded-lg">
          <h3 className="font-semibold text-sm text-base-content mb-3">Quick Stats</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-base-content/70">Active Users</span>
              <span className="text-success font-medium">--</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/70">Online Devices</span>
              <span className="text-info font-medium">--</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-content/70">Security Events</span>
              <span className="text-warning font-medium">--</span>
            </div>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="mt-4 p-3 bg-success/10 rounded-lg border border-success/20">
          <div className="flex items-center gap-2">
            <div className="status-online"></div>
            <div>
              <div className="text-sm font-medium text-success">System Online</div>
              <div className="text-xs text-base-content/60">All services operational</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
