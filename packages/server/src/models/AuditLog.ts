import { Schema, model, Document, Types, Model } from 'mongoose';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  userId?: Types.ObjectId; // May be null for system events
  deviceId?: Types.ObjectId;
  sessionId?: Types.ObjectId;
  action: string; // e.g., 'user.login', 'message.send', 'key.rotate'
  category: 'auth' | 'message' | 'call' | 'key_management' | 'admin' | 'system' | 'security';
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'success' | 'failure' | 'pending';
  resourceType?: 'user' | 'device' | 'message' | 'call' | 'session' | 'key_bundle';
  resourceId?: string; // ID of the affected resource
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
      headers?: Record<string, string>;
    };
    response?: {
      statusCode: number;
      duration: number; // in milliseconds
    };
    changes?: {
      before?: Record<string, any>;
      after?: Record<string, any>;
    };
  };
  tags: string[]; // For easier filtering and searching
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
  correlation: {
    requestId?: string;
    traceId?: string;
    spanId?: string;
    parentEventId?: Types.ObjectId;
  };
  retention: {
    expiresAt?: Date; // For automatic cleanup
    archived: boolean;
    archivedAt?: Date;
  };
  createdAt: Date;
}

export interface IAuditLogMethods {
  archive(): Promise<void>;
  addTag(tag: string): Promise<void>;
  removeTags(tags: string[]): Promise<void>;
  isExpired(): boolean;
  toSummary(): any;
}

type AuditLogModel = Model<IAuditLog, {}, IAuditLogMethods>;

const auditLogSchema = new Schema<IAuditLog, AuditLogModel, IAuditLogMethods>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    sparse: true, // Allow null values
  },
  deviceId: {
    type: Schema.Types.ObjectId,
    ref: 'Device',
    index: true,
    sparse: true,
  },
  sessionId: {
    type: Schema.Types.ObjectId,
    ref: 'Session',
    index: true,
    sparse: true,
  },
  action: {
    type: String,
    required: true,
    index: true,
  },
  category: {
    type: String,
    enum: ['auth', 'message', 'call', 'key_management', 'admin', 'system', 'security'],
    required: true,
    index: true,
  },
  severity: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info',
    index: true,
  },
  status: {
    type: String,
    enum: ['success', 'failure', 'pending'],
    required: true,
    index: true,
  },
  resourceType: {
    type: String,
    enum: ['user', 'device', 'message', 'call', 'session', 'key_bundle'],
    index: true,
  },
  resourceId: {
    type: String,
    index: true,
  },
  details: {
    description: { type: String, required: true },
    metadata: Schema.Types.Mixed,
    error: {
      code: String,
      message: String,
      stack: String,
    },
    request: {
      method: String,
      url: String,
      userAgent: String,
      ipAddress: String,
      headers: Schema.Types.Mixed,
    },
    response: {
      statusCode: Number,
      duration: Number,
    },
    changes: {
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed,
    },
  },
  tags: [{
    type: String,
    index: true,
  }],
  context: {
    ipAddress: { type: String, required: true },
    userAgent: String,
    location: {
      country: String,
      city: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    clientVersion: String,
    serverVersion: { type: String, required: true },
    environment: {
      type: String,
      enum: ['development', 'staging', 'production'],
      required: true,
    },
  },
  correlation: {
    requestId: String,
    traceId: String,
    spanId: String,
    parentEventId: {
      type: Schema.Types.ObjectId,
      ref: 'AuditLog',
    },
  },
  retention: {
    expiresAt: {
      type: Date,
      index: { expireAfterSeconds: 0 }, // TTL index
    },
    archived: { type: Boolean, default: false },
    archivedAt: Date,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Only track creation time
});

// Indexes
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, severity: 1 });
auditLogSchema.index({ status: 1, createdAt: -1 });
auditLogSchema.index({ 'context.ipAddress': 1 });
auditLogSchema.index({ tags: 1 });
auditLogSchema.index({ 'correlation.requestId': 1 });
auditLogSchema.index({ 'correlation.traceId': 1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ 'retention.expiresAt': 1 }, { expireAfterSeconds: 0 });

// Methods
auditLogSchema.methods.archive = async function(): Promise<void> {
  this.retention.archived = true;
  this.retention.archivedAt = new Date();
  await this.save();
};

auditLogSchema.methods.addTag = async function(tag: string): Promise<void> {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    await this.save();
  }
};

auditLogSchema.methods.removeTags = async function(tags: string[]): Promise<void> {
  this.tags = this.tags.filter(tag => !tags.includes(tag));
  await this.save();
};

auditLogSchema.methods.isExpired = function(): boolean {
  return this.retention.expiresAt && this.retention.expiresAt < new Date();
};

auditLogSchema.methods.toSummary = function(): any {
  return {
    id: this._id,
    action: this.action,
    category: this.category,
    severity: this.severity,
    status: this.status,
    description: this.details.description,
    userId: this.userId,
    ipAddress: this.context.ipAddress,
    createdAt: this.createdAt,
  };
};

// Static methods
auditLogSchema.statics.logEvent = async function(eventData: {
  userId?: Types.ObjectId;
  deviceId?: Types.ObjectId;
  sessionId?: Types.ObjectId;
  action: string;
  category: string;
  severity?: string;
  status: string;
  resourceType?: string;
  resourceId?: string;
  description: string;
  metadata?: Record<string, any>;
  error?: any;
  request?: any;
  response?: any;
  changes?: any;
  tags?: string[];
  context: {
    ipAddress: string;
    userAgent?: string;
    location?: any;
    clientVersion?: string;
  };
  correlation?: {
    requestId?: string;
    traceId?: string;
    spanId?: string;
    parentEventId?: Types.ObjectId;
  };
  retentionDays?: number;
}) {
  const serverVersion = process.env.SERVER_VERSION || '1.0.0';
  const environment = (process.env.NODE_ENV as any) || 'development';
  
  const logEntry = new this({
    userId: eventData.userId,
    deviceId: eventData.deviceId,
    sessionId: eventData.sessionId,
    action: eventData.action,
    category: eventData.category,
    severity: eventData.severity || 'info',
    status: eventData.status,
    resourceType: eventData.resourceType,
    resourceId: eventData.resourceId,
    details: {
      description: eventData.description,
      metadata: eventData.metadata,
      error: eventData.error,
      request: eventData.request,
      response: eventData.response,
      changes: eventData.changes,
    },
    tags: eventData.tags || [],
    context: {
      ...eventData.context,
      serverVersion,
      environment,
    },
    correlation: eventData.correlation,
    retention: {
      expiresAt: eventData.retentionDays 
        ? new Date(Date.now() + eventData.retentionDays * 24 * 60 * 60 * 1000)
        : undefined,
      archived: false,
    },
  });

  return logEntry.save();
};

auditLogSchema.statics.getUserActivity = async function(
  userId: Types.ObjectId,
  options: {
    startDate?: Date;
    endDate?: Date;
    categories?: string[];
    actions?: string[];
    page?: number;
    limit?: number;
  } = {}
) {
  const {
    startDate,
    endDate,
    categories,
    actions,
    page = 1,
    limit = 50
  } = options;

  const query: any = { userId };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  if (categories?.length) {
    query.category = { $in: categories };
  }

  if (actions?.length) {
    query.action = { $in: actions };
  }

  const skip = (page - 1) * limit;

  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'username displayName')
    .populate('deviceId', 'deviceName deviceType');
};

auditLogSchema.statics.getSecurityEvents = async function(
  options: {
    severity?: string[];
    status?: string[];
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  } = {}
) {
  const {
    severity = ['warning', 'error', 'critical'],
    status,
    startDate,
    endDate,
    limit = 100
  } = options;

  const query: any = {
    category: 'security',
    severity: { $in: severity }
  };

  if (status?.length) {
    query.status = { $in: status };
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username displayName');
};

auditLogSchema.statics.getSystemMetrics = async function(timeframe: 'hour' | 'day' | 'week' = 'day') {
  const now = new Date();
  let startDate: Date;

  switch (timeframe) {
    case 'hour':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const pipeline = [
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: {
          category: '$category',
          severity: '$severity',
          status: '$status'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ];

  return this.aggregate(pipeline);
};

// Pre-save middleware
auditLogSchema.pre('save', function(next) {
  // Set default retention based on severity if not specified
  if (!this.retention.expiresAt) {
    let retentionDays = 30; // Default

    switch (this.severity) {
      case 'critical':
        retentionDays = 365; // 1 year
        break;
      case 'error':
        retentionDays = 180; // 6 months
        break;
      case 'warning':
        retentionDays = 90; // 3 months
        break;
      default:
        retentionDays = 30; // 1 month
    }

    this.retention.expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  }

  next();
});

export const AuditLog = model<IAuditLog, AuditLogModel>('AuditLog', auditLogSchema);
export default AuditLog;
