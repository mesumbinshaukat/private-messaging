import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { 
  User, 
  Device, 
  Session, 
  AuditLog, 
  AdminStats, 
  Analytics, 
  PendingApproval, 
  TokenRevocation, 
  RoleUpdate,
  Call,
  MessageEnvelope
} from '@/types/admin';

const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
              const response = await axios.post(`${BASE_URL}/api/auth/refresh`, {
                refreshToken,
              });

              const { accessToken } = response.data;
              localStorage.setItem('accessToken', accessToken);

              // Retry the original request with new token
              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/auth/login';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Authentication
  async login(email: string, password: string) {
    const response = await this.client.post('/api/auth/login', {
      email,
      password,
    });
    return response.data;
  }

  async logout() {
    const response = await this.client.post('/api/auth/logout');
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await this.client.get('/api/auth/me');
    return response.data;
  }

  // Admin Stats
  async getAdminStats(): Promise<AdminStats> {
    const response = await this.client.get('/api/admin/stats');
    return response.data;
  }

  // Analytics with Pagination and Filtering
  async getAnalytics(timeframe: 'day' | 'week' | 'month' = 'week', page = 1, limit = 20): Promise<{ analytics: Analytics, total: number }> {
    const response = await this.client.get(`/api/admin/analytics`, {
      params: { timeframe, page, limit }
    });
    return response.data;
  }

  // Users Management
  async getUsers(page = 1, limit = 20, search = '', status = ''): Promise<{ users: User[], total: number }> {
    const response = await this.client.get(`/api/admin/users`, {
      params: { page, limit, search, status },
    });
    return response.data;
  }

  async getUser(userId: string): Promise<User> {
    const response = await this.client.get(`/api/admin/users/${userId}`);
    return response.data;
  }

  async updateUserStatus(userId: string, status: string, reason: string): Promise<void> {
    await this.client.patch(`/api/admin/users/${userId}/status`, {
      status,
      reason,
    });
  }

  async updateUserRole(data: RoleUpdate): Promise<void> {
    await this.client.patch(`/api/admin/users/${data.userId}/role`, data);
  }

  async deleteUser(userId: string, reason: string): Promise<void> {
    await this.client.delete(`/api/admin/users/${userId}`, {
      data: { reason },
    });
  }

  // Devices Management
  async getDevices(page = 1, limit = 20, search = '', status = ''): Promise<{ devices: Device[], total: number }> {
    const response = await this.client.get(`/api/admin/devices`, {
      params: { page, limit, search, status },
    });
    return response.data;
  }

  async getUserDevices(userId: string): Promise<Device[]> {
    const response = await this.client.get(`/api/admin/users/${userId}/devices`);
    return response.data;
  }

  async revokeDevice(deviceId: string, reason: string): Promise<void> {
    await this.client.patch(`/api/admin/devices/${deviceId}/revoke`, {
      reason,
    });
  }

  async trustDevice(deviceId: string): Promise<void> {
    await this.client.patch(`/api/admin/devices/${deviceId}/trust`);
  }

  async untrustDevice(deviceId: string): Promise<void> {
    await this.client.patch(`/api/admin/devices/${deviceId}/untrust`);
  }

  // Sessions Management
  async getSessions(page = 1, limit = 20): Promise<{ sessions: Session[], total: number }> {
    const response = await this.client.get(`/api/admin/sessions`, {
      params: { page, limit },
    });
    return response.data;
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const response = await this.client.get(`/api/admin/users/${userId}/sessions`);
    return response.data;
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.client.delete(`/api/admin/sessions/${sessionId}`, {
      data: { reason },
    });
  }

  async revokeAllUserSessions(userId: string, reason: string): Promise<void> {
    await this.client.delete(`/api/admin/users/${userId}/sessions`, {
      data: { reason },
    });
  }

  async revokeTokens(data: TokenRevocation): Promise<void> {
    await this.client.post('/api/admin/tokens/revoke', data);
  }

  // Audit Logs
  async getAuditLogs(
    page = 1, 
    limit = 50, 
    filters: {
      category?: string;
      severity?: string;
      status?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<{ logs: AuditLog[], total: number }> {
    const response = await this.client.get(`/api/admin/audit-logs`, {
      params: { page, limit, ...filters },
    });
    return response.data;
  }

  async getSecurityEvents(limit = 50): Promise<AuditLog[]> {
    const response = await this.client.get(`/api/admin/security-events`, {
      params: { limit },
    });
    return response.data;
  }

  // Pending Approvals
  async getPendingApprovals(): Promise<PendingApproval[]> {
    const response = await this.client.get('/api/admin/approvals/pending');
    return response.data;
  }

  async approveRequest(approvalId: string, approved: boolean, reason: string): Promise<void> {
    await this.client.post(`/api/admin/approvals/${approvalId}`, {
      approved,
      reason,
    });
  }

  // Messages Analytics
  async getMessageStats(timeframe: 'day' | 'week' | 'month' = 'day'): Promise<{
    total: number;
    byType: { type: string; count: number }[];
    byDay: { date: string; count: number }[];
  }> {
    const response = await this.client.get(`/api/admin/messages/stats`, {
      params: { timeframe },
    });
    return response.data;
  }

  // Calls Analytics
  async getCallStats(timeframe: 'day' | 'week' | 'month' = 'day'): Promise<{
    total: number;
    totalMinutes: number;
    byType: { type: string; count: number; minutes: number }[];
    byDay: { date: string; count: number; minutes: number }[];
    qualityMetrics: { date: string; avgLatency: number; avgPacketLoss: number }[];
  }> {
    const response = await this.client.get(`/api/admin/calls/stats`, {
      params: { timeframe },
    });
    return response.data;
  }

  // System Health
  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    uptime: number;
    memory: { used: number; total: number };
    cpu: { usage: number };
    database: { status: string; latency: number };
    redis: { status: string; latency: number };
  }> {
    const response = await this.client.get('/api/admin/system/health');
    return response.data;
  }

  // Export Data
  async exportAuditLogs(): Promise<Blob> {
    const response = await this.client.get('/api/admin/export/audit-logs', {
      responseType: 'blob',
    });
    return response.data;
  }

  async exportUsers(): Promise<Blob> {
    const response = await this.client.get('/api/admin/export/users', {
      responseType: 'blob',
    });
    return response.data;
  }

  // Generic request method
  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.client.request(config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
