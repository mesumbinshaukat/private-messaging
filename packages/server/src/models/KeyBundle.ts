import { Schema, model, Document, Types, Model } from 'mongoose';

export interface IKeyBundle extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  deviceId: Types.ObjectId;
  identityKey: string; // Long-term identity key
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
    timestamp: Date;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
    used: boolean;
    usedAt?: Date;
    usedBy?: Types.ObjectId; // User who used this key
  }>;
  registrationId: number; // Unique registration ID for this device
  keyType: 'X3DH' | 'Double-Ratchet' | 'Hybrid';
  version: string; // Protocol version
  status: 'active' | 'rotated' | 'revoked';
  rotationSchedule: {
    signedPreKeyRotation: Date; // When to rotate signed pre-key
    oneTimePreKeyRefill: Date; // When to refill one-time pre-keys
  };
  usage: {
    oneTimeKeysUsed: number;
    lastKeyUsed: Date;
    totalConversationsStarted: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IKeyBundleMethods {
  useOneTimePreKey(keyId: number, usedBy: Types.ObjectId): Promise<string | null>;
  addOneTimePreKeys(keys: Array<{ keyId: number; publicKey: string }>): Promise<void>;
  rotateSignedPreKey(newSignedPreKey: { keyId: number; publicKey: string; signature: string }): Promise<void>;
  markForRotation(): Promise<void>;
  cleanupUsedKeys(): Promise<number>;
  getAvailableOneTimeKeys(): number;
  needsRotation(): boolean;
}

type KeyBundleModel = Model<IKeyBundle, {}, IKeyBundleMethods>;

const keyBundleSchema = new Schema<IKeyBundle, KeyBundleModel, IKeyBundleMethods>({
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
    unique: true, // One key bundle per device
  },
  identityKey: {
    type: String,
    required: true,
    index: true,
  },
  signedPreKey: {
    keyId: { type: Number, required: true },
    publicKey: { type: String, required: true },
    signature: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  oneTimePreKeys: [{
    keyId: { type: Number, required: true },
    publicKey: { type: String, required: true },
    used: { type: Boolean, default: false, index: true },
    usedAt: Date,
    usedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  registrationId: {
    type: Number,
    required: true,
    unique: true,
  },
  keyType: {
    type: String,
    enum: ['X3DH', 'Double-Ratchet', 'Hybrid'],
    default: 'X3DH',
  },
  version: {
    type: String,
    required: true,
    default: '1.0.0',
  },
  status: {
    type: String,
    enum: ['active', 'rotated', 'revoked'],
    default: 'active',
    index: true,
  },
  rotationSchedule: {
    signedPreKeyRotation: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    oneTimePreKeyRefill: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  },
  usage: {
    oneTimeKeysUsed: { type: Number, default: 0 },
    lastKeyUsed: Date,
    totalConversationsStarted: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
});

// Indexes
keyBundleSchema.index({ userId: 1, status: 1 });
keyBundleSchema.index({ deviceId: 1 });
keyBundleSchema.index({ identityKey: 1 });
keyBundleSchema.index({ registrationId: 1 });
keyBundleSchema.index({ 'oneTimePreKeys.used': 1 });
keyBundleSchema.index({ 'oneTimePreKeys.keyId': 1 });
keyBundleSchema.index({ 'rotationSchedule.signedPreKeyRotation': 1 });
keyBundleSchema.index({ 'rotationSchedule.oneTimePreKeyRefill': 1 });

// Methods
keyBundleSchema.methods.useOneTimePreKey = async function(keyId: number, usedBy: Types.ObjectId): Promise<string | null> {
  const keyIndex = this.oneTimePreKeys.findIndex(
    key => key.keyId === keyId && !key.used
  );
  
  if (keyIndex === -1) {
    return null; // Key not found or already used
  }
  
  const key = this.oneTimePreKeys[keyIndex];
  key.used = true;
  key.usedAt = new Date();
  key.usedBy = usedBy;
  
  this.usage.oneTimeKeysUsed += 1;
  this.usage.lastKeyUsed = new Date();
  this.usage.totalConversationsStarted += 1;
  
  await this.save();
  return key.publicKey;
};

keyBundleSchema.methods.addOneTimePreKeys = async function(keys: Array<{ keyId: number; publicKey: string }>): Promise<void> {
  // Remove any existing keys with the same keyIds
  const existingKeyIds = keys.map(k => k.keyId);
  this.oneTimePreKeys = this.oneTimePreKeys.filter(
    key => !existingKeyIds.includes(key.keyId)
  );
  
  // Add new keys
  this.oneTimePreKeys.push(...keys.map(key => ({
    ...key,
    used: false,
  })));
  
  // Update refill schedule
  this.rotationSchedule.oneTimePreKeyRefill = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  await this.save();
};

keyBundleSchema.methods.rotateSignedPreKey = async function(newSignedPreKey: { keyId: number; publicKey: string; signature: string }): Promise<void> {
  this.signedPreKey = {
    ...newSignedPreKey,
    timestamp: new Date(),
  };
  
  // Update rotation schedule
  this.rotationSchedule.signedPreKeyRotation = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  await this.save();
};

keyBundleSchema.methods.markForRotation = async function(): Promise<void> {
  this.status = 'rotated';
  await this.save();
};

keyBundleSchema.methods.cleanupUsedKeys = async function(): Promise<number> {
  const initialCount = this.oneTimePreKeys.length;
  
  // Remove keys that have been used and are older than 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  this.oneTimePreKeys = this.oneTimePreKeys.filter(
    key => !key.used || (key.usedAt && key.usedAt > oneDayAgo)
  );
  
  await this.save();
  return initialCount - this.oneTimePreKeys.length;
};

keyBundleSchema.methods.getAvailableOneTimeKeys = function(): number {
  return this.oneTimePreKeys.filter(key => !key.used).length;
};

keyBundleSchema.methods.needsRotation = function(): boolean {
  const now = new Date();
  return (
    this.rotationSchedule.signedPreKeyRotation < now ||
    this.rotationSchedule.oneTimePreKeyRefill < now ||
    this.getAvailableOneTimeKeys() < 5 // Refill when less than 5 keys available
  );
};

// Static methods
keyBundleSchema.statics.getUserKeyBundle = async function(userId: Types.ObjectId, deviceId?: Types.ObjectId) {
  const query: any = { userId, status: 'active' };
  if (deviceId) {
    query.deviceId = deviceId;
  }
  
  return this.findOne(query)
    .populate('userId', 'username displayName')
    .populate('deviceId', 'deviceName deviceType');
};

keyBundleSchema.statics.getKeyBundleForConversation = async function(
  recipientUserId: Types.ObjectId,
  recipientDeviceId?: Types.ObjectId
) {
  const keyBundle = await this.getUserKeyBundle(recipientUserId, recipientDeviceId);
  
  if (!keyBundle || keyBundle.getAvailableOneTimeKeys() === 0) {
    return null;
  }
  
  // Return a clean key bundle without sensitive information
  return {
    userId: keyBundle.userId,
    deviceId: keyBundle.deviceId,
    identityKey: keyBundle.identityKey,
    signedPreKey: keyBundle.signedPreKey,
    registrationId: keyBundle.registrationId,
    availableOneTimeKeys: keyBundle.getAvailableOneTimeKeys(),
  };
};

keyBundleSchema.statics.findKeysNeedingRotation = async function() {
  const now = new Date();
  return this.find({
    status: 'active',
    $or: [
      { 'rotationSchedule.signedPreKeyRotation': { $lt: now } },
      { 'rotationSchedule.oneTimePreKeyRefill': { $lt: now } },
    ],
  });
};

// Pre-save middleware
keyBundleSchema.pre('save', function(next) {
  // Ensure one-time pre-keys are sorted by keyId
  this.oneTimePreKeys.sort((a, b) => a.keyId - b.keyId);
  next();
});

export const KeyBundle = model<IKeyBundle, KeyBundleModel>('KeyBundle', keyBundleSchema);
export default KeyBundle;
