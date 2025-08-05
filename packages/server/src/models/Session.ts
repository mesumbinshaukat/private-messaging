import { Schema, model, Document, Types, Model } from 'mongoose';

export interface ISession extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  deviceId: Types.ObjectId;
  refreshToken: string;
  accessToken?: string;
  tokenFamily: string; // For refresh token rotation
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
  lastActivity: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISessionMethods {
  revoke(): Promise<void>;
  isExpired(): boolean;
  updateActivity(ipAddress: string, userAgent: string): Promise<void>;
  rotateTokens(newAccessToken: string, newRefreshToken: string): Promise<void>;
}

type SessionModel = Model<ISession, {}, ISessionMethods>;

const sessionSchema = new Schema<ISession, SessionModel, ISessionMethods>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  deviceId: {
    type: Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true,
  },
  refreshToken: {
    type: String,
    required: true,
    unique: true,
    select: false, // Don't include in queries by default
  },
  accessToken: {
    type: String,
    select: false, // Don't include in queries by default
  },
  tokenFamily: {
    type: String,
    required: true,
    index: true,
  },
  ipAddress: {
    type: String,
    required: true,
  },
  userAgent: {
    type: String,
    required: true,
  },
  location: {
    country: String,
    city: String,
    coordinates: {
      lat: Number,
      lng: Number,
    },
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'revoked'],
    default: 'active',
    index: true,
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }, // TTL index
  },
}, {
  timestamps: true,
});

// Indexes
sessionSchema.index({ userId: 1, status: 1 });
sessionSchema.index({ deviceId: 1, status: 1 });
sessionSchema.index({ tokenFamily: 1 });
sessionSchema.index({ refreshToken: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ lastActivity: -1 });

// Methods
sessionSchema.methods.revoke = async function(): Promise<void> {
  this.status = 'revoked';
  await this.save();
};

sessionSchema.methods.isExpired = function(): boolean {
  return this.expiresAt < new Date() || this.status !== 'active';
};

sessionSchema.methods.updateActivity = async function(ipAddress: string, userAgent: string): Promise<void> {
  this.lastActivity = new Date();
  this.ipAddress = ipAddress;
  this.userAgent = userAgent;
  await this.save();
};

sessionSchema.methods.rotateTokens = async function(newAccessToken: string, newRefreshToken: string): Promise<void> {
  this.accessToken = newAccessToken;
  this.refreshToken = newRefreshToken;
  this.lastActivity = new Date();
  await this.save();
};

// Pre-save middleware
sessionSchema.pre('save', function(next) {
  if (this.isNew) {
    // Set expiration date for new sessions (7 days from creation)
    if (!this.expiresAt) {
      this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }
  }
  next();
});

// Static methods
sessionSchema.statics.cleanupExpiredSessions = async function() {
  const result = await this.deleteMany({
    $or: [
      { expiresAt: { $lt: new Date() } },
      { status: { $in: ['expired', 'revoked'] } }
    ]
  });
  return result.deletedCount;
};

sessionSchema.statics.revokeAllUserSessions = async function(userId: Types.ObjectId) {
  return this.updateMany(
    { userId, status: 'active' },
    { status: 'revoked' }
  );
};

sessionSchema.statics.revokeDeviceSessions = async function(deviceId: Types.ObjectId) {
  return this.updateMany(
    { deviceId, status: 'active' },
    { status: 'revoked' }
  );
};

export const Session = model<ISession, SessionModel>('Session', sessionSchema);
export default Session;
