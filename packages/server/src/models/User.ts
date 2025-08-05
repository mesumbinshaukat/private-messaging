import { Schema, model, Document, Types, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  username: string;
  passwordHash?: string;
  displayName: string;
  avatar?: string;
  publicKey: string;
  identityKey: string;
  signedPreKey: string;
  preKeySignature: string;
  oneTimePreKeys: string[];
  role: 'user' | 'superadmin';
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  lastActive: Date;
  emailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  backupCodes: string[];
  webAuthnCredentials: Array<{
    id: string;
    publicKey: string;
    counter: number;
    transports?: string[];
    createdAt: Date;
    name: string;
  }>;
  devices: Types.ObjectId[];
  blockedUsers: Types.ObjectId[];
  settings: {
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
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAuthTokens(): Promise<{ accessToken: string; refreshToken: string }>;
  addDevice(deviceId: Types.ObjectId): Promise<void>;
  removeDevice(deviceId: Types.ObjectId): Promise<void>;
  blockUser(userId: Types.ObjectId): Promise<void>;
  unblockUser(userId: Types.ObjectId): Promise<void>;
  updateLastActive(): Promise<void>;
  rotatePreKeys(): Promise<void>;
}

type UserModel = Model<IUser, {}, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    index: true,
  },
  passwordHash: {
    type: String,
    select: false, // Don't include in queries by default
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  avatar: {
    type: String,
    validate: {
      validator: (v: string) => !v || /^https?:\/\//.test(v),
      message: 'Avatar must be a valid URL',
    },
  },
  publicKey: {
    type: String,
    required: true,
  },
  identityKey: {
    type: String,
    required: true,
    unique: true,
  },
  signedPreKey: {
    type: String,
    required: true,
  },
  preKeySignature: {
    type: String,
    required: true,
  },
  oneTimePreKeys: [{
    type: String,
    required: true,
  }],
  role: {
    type: String,
    enum: ['user', 'superadmin'],
    default: 'user',
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'deleted'],
    default: 'active',
    index: true,
  },
  lastActive: {
    type: Date,
    default: Date.now,
    index: true,
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationToken: {
    type: String,
    select: false,
  },
  passwordResetToken: {
    type: String,
    select: false,
  },
  passwordResetExpires: {
    type: Date,
    select: false,
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: String,
    select: false,
  },
  backupCodes: [{
    type: String,
    select: false,
  }],
  webAuthnCredentials: [{
    id: { type: String, required: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, required: true, default: 0 },
    transports: [String],
    createdAt: { type: Date, default: Date.now },
    name: { type: String, required: true },
  }],
  devices: [{
    type: Schema.Types.ObjectId,
    ref: 'Device',
  }],
  blockedUsers: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  settings: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system',
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
    },
    privacy: {
      readReceipts: { type: Boolean, default: true },
      onlineStatus: { type: Boolean, default: true },
      lastSeen: { type: Boolean, default: true },
    },
  },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret.passwordHash;
      delete ret.twoFactorSecret;
      delete ret.backupCodes;
      delete ret.emailVerificationToken;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      return ret;
    },
  },
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ identityKey: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ 'webAuthnCredentials.id': 1 });

// Methods
userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.methods.generateAuthTokens = async function(): Promise<{ accessToken: string; refreshToken: string }> {
  const jwt = require('jsonwebtoken');
  const payload = {
    userId: this._id,
    email: this.email,
    role: this.role,
  };
  
  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  
  return { accessToken, refreshToken };
};

userSchema.methods.addDevice = async function(deviceId: Types.ObjectId): Promise<void> {
  if (!this.devices.includes(deviceId)) {
    this.devices.push(deviceId);
    await this.save();
  }
};

userSchema.methods.removeDevice = async function(deviceId: Types.ObjectId): Promise<void> {
  this.devices = this.devices.filter(id => !id.equals(deviceId));
  await this.save();
};

userSchema.methods.blockUser = async function(userId: Types.ObjectId): Promise<void> {
  if (!this.blockedUsers.includes(userId)) {
    this.blockedUsers.push(userId);
    await this.save();
  }
};

userSchema.methods.unblockUser = async function(userId: Types.ObjectId): Promise<void> {
  this.blockedUsers = this.blockedUsers.filter(id => !id.equals(userId));
  await this.save();
};

userSchema.methods.updateLastActive = async function(): Promise<void> {
  this.lastActive = new Date();
  await this.save();
};

userSchema.methods.rotatePreKeys = async function(): Promise<void> {
  // This would integrate with the crypto module to generate new keys
  // For now, we'll leave this as a placeholder
  console.log('Rotating pre-keys for user:', this.username);
};

// Pre-save middleware
userSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  
  if (this.passwordHash) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
  next();
});

export const User = model<IUser, UserModel>('User', userSchema);
export default User;
