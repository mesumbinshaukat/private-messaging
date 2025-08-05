import { Schema, model, Document, Types, Model } from 'mongoose';

export interface IDevice extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  deviceId: string; // Unique identifier for the device
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'web' | 'tablet';
  platform: string; // iOS, Android, Windows, macOS, Linux, etc.
  appVersion: string;
  fingerprint: string; // Device fingerprint for additional security
  publicKey: string; // Device-specific public key
  registrationId: number; // Signal protocol registration ID
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
  pushToken?: string; // For push notifications
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
  lastActive: Date;
  trustedDevice: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeviceMethods {
  revoke(): Promise<void>;
  updateActivity(ipAddress: string, userAgent: string): Promise<void>;
  rotateKeys(): Promise<void>;
  trust(): Promise<void>;
  untrust(): Promise<void>;
}

type DeviceModel = Model<IDevice, {}, IDeviceMethods>;

const deviceSchema = new Schema<IDevice, DeviceModel, IDeviceMethods>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  deviceName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  deviceType: {
    type: String,
    enum: ['mobile', 'desktop', 'web', 'tablet'],
    required: true,
  },
  platform: {
    type: String,
    required: true,
    trim: true,
  },
  appVersion: {
    type: String,
    required: true,
  },
  fingerprint: {
    type: String,
    required: true,
    unique: true,
  },
  publicKey: {
    type: String,
    required: true,
  },
  registrationId: {
    type: Number,
    required: true,
  },
  signedPreKey: {
    keyId: { type: Number, required: true },
    publicKey: { type: String, required: true },
    signature: { type: String, required: true },
  },
  oneTimePreKeys: [{
    keyId: { type: Number, required: true },
    publicKey: { type: String, required: true },
  }],
  pushToken: {
    type: String,
    sparse: true, // Allow multiple null values but unique non-null values
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
    enum: ['active', 'inactive', 'revoked'],
    default: 'active',
  },
  lastActive: {
    type: Date,
    default: Date.now,
    index: true,
  },
  trustedDevice: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Indexes
deviceSchema.index({ userId: 1, status: 1 });
deviceSchema.index({ deviceId: 1 });
deviceSchema.index({ fingerprint: 1 });
deviceSchema.index({ lastActive: -1 });
deviceSchema.index({ 'oneTimePreKeys.keyId': 1 });

// Methods
deviceSchema.methods.revoke = async function(): Promise<void> {
  this.status = 'revoked';
  await this.save();
};

deviceSchema.methods.updateActivity = async function(ipAddress: string, userAgent: string): Promise<void> {
  this.lastActive = new Date();
  this.ipAddress = ipAddress;
  this.userAgent = userAgent;
  this.status = 'active';
  await this.save();
};

deviceSchema.methods.rotateKeys = async function(): Promise<void> {
  // This would integrate with the crypto module to generate new keys
  console.log('Rotating keys for device:', this.deviceId);
};

deviceSchema.methods.trust = async function(): Promise<void> {
  this.trustedDevice = true;
  await this.save();
};

deviceSchema.methods.untrust = async function(): Promise<void> {
  this.trustedDevice = false;
  await this.save();
};

// Pre-save middleware to update lastActive
deviceSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'active') {
    this.lastActive = new Date();
  }
  next();
});

export const Device = model<IDevice, DeviceModel>('Device', deviceSchema);
export default Device;
