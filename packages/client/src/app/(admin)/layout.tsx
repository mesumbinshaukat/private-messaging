'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { User } from '@/types/admin';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminHeader from '@/components/admin/AdminHeader';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          router.push('/auth/login');
          return;
        }

        const currentUser = await apiClient.getCurrentUser();
        
        // Check if user has superadmin role
        if (currentUser.role !== 'superadmin') {
          router.push('/unauthorized');
          return;
        }

        setUser(currentUser);
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div className="text-center">
          <div className="admin-loading mb-4"></div>
          <p className="text-base-content/70">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-base-100">
      <div className="drawer lg:drawer-open">
        <input 
          id="admin-drawer" 
          type="checkbox" 
          className="drawer-toggle"
          checked={sidebarOpen}
          onChange={(e) => setSidebarOpen(e.target.checked)}
        />
        
        <div className="drawer-content flex flex-col">
          {/* Header */}
          <AdminHeader 
            user={user} 
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          />
          
          {/* Main Content */}
          <main className="flex-1 p-4 lg:p-8 bg-base-100 min-h-screen">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
        
        {/* Sidebar */}
        <div className="drawer-side">
          <label 
            htmlFor="admin-drawer" 
            className="drawer-overlay lg:hidden"
            onClick={() => setSidebarOpen(false)}
          ></label>
          <AdminSidebar />
        </div>
      </div>
    </div>
  );
}
