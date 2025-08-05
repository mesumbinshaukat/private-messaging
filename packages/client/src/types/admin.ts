export interface User {
  _id: string;
  email: string;
  username: string;
  displayName: string;
  avatar?: string;
  role: 'user' | 'superadmin';
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  lastActive: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  devices: Device[];
  settings: UserSettings;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  _id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'web' | 'tablet';
  platform: string;
  appVersion: string;
  fingerprint: string;
  ipAddress: string;
  userAgent: string;
  location?: {
    country: string;
    city: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  status: 'active' | 'inactive' | 'revoked';
  lastActive: string;
  trustedDevice: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  _id: string;
  userId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  location?: {
    country: string;
    city: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  status: 'active' | 'expired' | 'revoked';
  lastActivity: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  _id: string;
  userId?: string;
  deviceId?: string;
  sessionId?: string;
  action: string;
  category: 'auth' | 'message' | 'call' | 'key_management' | 'admin' | 'system' | 'security';
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'success' | 'failure' | 'pending';
  resourceType?: string;
  resourceId?: string;
  details: {
    description: string;
    metadata?: Record<string, any>;
    error?: {
      code: string;
      message: string;
      stack?: string;
    };
    request?: {
      method: string;
      url: string;
      userAgent: string;
      ipAddress: string;
    };
    response?: {
      statusCode: number;
      duration: number;
    };
  };
  tags: string[];
  context: {
    ipAddress: string;
    userAgent?: string;
    location?: {
      country: string;
      city: string;
      coordinates?: {
        lat: number;
        lng: number;
      };
    };
    clientVersion?: string;
    serverVersion: string;
    environment: 'development' | 'staging' | 'production';
  };
  createdAt: string;
}

export interface Call {
  _id: string;
  callId: string;
  initiatorId: string;
  participantIds: string[];
  callType: 'audio' | 'video' | 'screen_share';
  status: 'initiated' | 'ringing' | 'accepted' | 'rejected' | 'missed' | 'ended' | 'failed';
  isGroupCall: boolean;
  duration: number;
  quality: {
    avgBitrate: number;
    avgPacketLoss: number;
    avgLatency: number;
    connectionDrops: number;
  };
  endReason: 'user_ended' | 'timeout' | 'network_error' | 'server_error' | 'declined';
  createdAt: string;
  updatedAt: string;
}

export interface MessageEnvelope {
  _id: string;
  messageId: string;
  senderId: string;
  recipientId: string;
  conversationId: string;
  messageType: 'text' | 'file' | 'image' | 'video' | 'audio' | 'document' | 'system';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    sound: boolean;
  };
  privacy: {
    readReceipts: boolean;
    onlineStatus: boolean;
    lastSeen: boolean;
  };
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalDevices: number;
  activeDevices: number;
  totalSessions: number;
  activeSessions: number;
  totalMessages: number;
  messagesLastDay: number;
  totalCalls: number;
  callMinutesLastDay: number;
  securityEvents: number;
  pendingApprovals: number;
}

export interface Analytics {
  messagesPerDay: { date: string; count: number }[];
  activeDevicesPerDay: { date: string; count: number }[];
  callMinutesPerDay: { date: string; minutes: number }[];
  userRegistrationsPerDay: { date: string; count: number }[];
  securityEventsPerDay: { date: string; count: number }[];
  deviceTypes: { type: string; count: number }[];
  messagePlatforms: { platform: string; count: number }[];
  callQuality: { date: string; avgLatency: number; avgPacketLoss: number }[];
}

export interface PendingApproval {
  _id: string;
  type: 'device' | 'user';
  deviceId?: string;
  userId: string;
  user: User;
  device?: Device;
  ipAddress: string;
  location?: {
    country: string;
    city: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  fingerprint?: string;
  userAgent?: string;
  riskScore: number;
  reasons: string[];
  createdAt: string;
}

export interface TokenRevocation {
  userId: string;
  sessionId?: string;
  deviceId?: string;
  reason: string;
  revokeAll?: boolean;
}

export interface RoleUpdate {
  userId: string;
  newRole: 'user' | 'superadmin';
  reason: string;
}
