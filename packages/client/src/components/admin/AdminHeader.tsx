'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FiMenu, 
  FiBell, 
  FiSearch, 
  FiUser, 
  FiSettings, 
  FiLogOut,
  FiShield,
  FiRefreshCw
} from 'react-icons/fi';
import { User } from '@/types/admin';
import { apiClient } from '@/lib/api';

interface AdminHeaderProps {
  user: User;
  onMenuToggle: () => void;
}

export default function AdminHeader({ user, onMenuToggle }: AdminHeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      router.push('/auth/login');
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Implement global search functionality
      console.log('Search:', searchQuery);
    }
  };

  return (
    <header className="bg-base-200 border-b border-base-300 px-4 lg:px-8 py-4">
      <div className="flex items-center justify-between">
        {/* Left Side */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Button */}
          <button
            onClick={onMenuToggle}
            className="btn btn-ghost btn-square lg:hidden"
          >
            <FiMenu className="w-5 h-5" />
          </button>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="hidden md:flex">
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/60 w-4 h-4" />
              <input
                type="search"
                placeholder="Search users, devices, logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="admin-input pl-10 pr-4 py-2 w-64 lg:w-80"
              />
            </div>
          </form>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {/* Refresh Button */}
          <button className="btn btn-ghost btn-square admin-tooltip" data-tip="Refresh Data">
            <FiRefreshCw className="w-5 h-5" />
          </button>

          {/* Notifications */}
          <div className="dropdown dropdown-end">
            <button
              tabIndex={0}
              className="btn btn-ghost btn-square relative"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <FiBell className="w-5 h-5" />
              <div className="absolute -top-1 -right-1 bg-error text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                3
              </div>
            </button>
            {showNotifications && (
              <div className="dropdown-content admin-modal-box w-80 mt-2 shadow-xl">
                <div className="p-4">
                  <h3 className="font-semibold text-lg mb-3">Notifications</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
                      <FiShield className="w-4 h-4 text-warning mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Security Alert</p>
                        <p className="text-xs text-base-content/70">Multiple failed login attempts detected</p>
                        <p className="text-xs text-base-content/50 mt-1">2 minutes ago</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-info/10 rounded-lg border border-info/20">
                      <FiUser className="w-4 h-4 text-info mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">New User Registration</p>
                        <p className="text-xs text-base-content/70">Pending approval required</p>
                        <p className="text-xs text-base-content/50 mt-1">5 minutes ago</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 bg-success/10 rounded-lg border border-success/20">
                      <FiRefreshCw className="w-4 h-4 text-success mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">System Update</p>
                        <p className="text-xs text-base-content/70">Database optimization completed</p>
                        <p className="text-xs text-base-content/50 mt-1">1 hour ago</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-base-300">
                    <button className="text-sm text-primary hover:underline">View all notifications</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="dropdown dropdown-end">
            <button
              tabIndex={0}
              className="btn btn-ghost btn-circle avatar"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div className="w-8 rounded-full bg-primary text-primary-content flex items-center justify-center">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.displayName} className="w-8 h-8 rounded-full" />
                ) : (
                  <span className="text-sm font-medium">
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
            </button>
            {showUserMenu && (
              <div className="dropdown-content admin-modal-box w-64 mt-2 shadow-xl">
                <div className="p-4">
                  {/* User Info */}
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-base-300">
                    <div className="w-12 h-12 rounded-full bg-primary text-primary-content flex items-center justify-center">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.displayName} className="w-12 h-12 rounded-full" />
                      ) : (
                        <span className="text-lg font-medium">
                          {user.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{user.displayName}</h4>
                      <p className="text-sm text-base-content/70">{user.email}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <div className="admin-badge admin-badge text-xs px-2 py-1">
                          {user.role}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <div className="space-y-1">
                    <button
                      onClick={() => router.push('/admin/profile')}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-base-300 transition-colors"
                    >
                      <FiUser className="w-4 h-4" />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={() => router.push('/admin/settings')}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-base-300 transition-colors"
                    >
                      <FiSettings className="w-4 h-4" />
                      <span>Settings</span>
                    </button>
                    <div className="admin-divider my-2"></div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-error/10 text-error transition-colors"
                    >
                      <FiLogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
