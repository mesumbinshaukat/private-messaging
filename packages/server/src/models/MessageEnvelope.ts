import { Schema, model, Document, Types, Model } from 'mongoose';

export interface IMessageEnvelope extends Document {
  _id: Types.ObjectId;
  messageId: string; // Client-generated unique identifier
  senderId: Types.ObjectId;
  recipientId: Types.ObjectId;
  senderDeviceId: Types.ObjectId;
  recipientDeviceId?: Types.ObjectId; // May be null for multi-device scenarios
  conversationId: string; // Derived from participants
  messageType: 'text' | 'file' | 'image' | 'video' | 'audio' | 'document' | 'system';
  encryptedContent: string; // End-to-end encrypted message content
  encryptedKey?: string; // For file messages, encrypted file key
  metadata: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number; // For audio/video
    dimensions?: {
      width: number;
      height: number;
    };
    thumbnail?: string; // Base64 encoded thumbnail
  };
  doubleRatchetHeader: {
    dhPublicKey: string;
    previousChainLength: number;
    messageNumber: number;
  };
  preKeyId?: number; // For initial messages in a conversation
  oneTimePreKeyId?: number; // For initial messages
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  deliveryReceipts: Array<{
    deviceId: Types.ObjectId;
    status: 'delivered' | 'read';
    timestamp: Date;
  }>;
  replyToMessageId?: string;
  forwardedFrom?: {
    originalSenderId: Types.ObjectId;
    originalMessageId: string;
    forwardChain: number; // Track forward depth
  };
  editHistory: Array<{
    editedAt: Date;
    previousContent: string; // Encrypted
  }>;
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  expiresAt?: Date; // For disappearing messages
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessageEnvelopeMethods {
  markAsDelivered(deviceId: Types.ObjectId): Promise<void>;
  markAsRead(deviceId: Types.ObjectId): Promise<void>;
  softDelete(deletedBy: Types.ObjectId): Promise<void>;
  addEdit(previousContent: string): Promise<void>;
  isExpired(): boolean;
  canBeDecrypted(deviceId: Types.ObjectId): boolean;
}

type MessageEnvelopeModel = Model<IMessageEnvelope, {}, IMessageEnvelopeMethods>;

const messageEnvelopeSchema = new Schema<IMessageEnvelope, MessageEnvelopeModel, IMessageEnvelopeMethods>({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  recipientId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  senderDeviceId: {
    type: Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
  },
  recipientDeviceId: {
    type: Schema.Types.ObjectId,
    ref: 'Device',
  },
  conversationId: {
    type: String,
    required: true,
    index: true,
  },
  messageType: {
    type: String,
    enum: ['text', 'file', 'image', 'video', 'audio', 'document', 'system'],
    required: true,
  },
  encryptedContent: {
    type: String,
    required: true,
  },
  encryptedKey: {
    type: String,
  },
  metadata: {
    fileName: String,
    fileSize: Number,
    mimeType: String,
    duration: Number,
    dimensions: {
      width: Number,
      height: Number,
    },
    thumbnail: String,
  },
  doubleRatchetHeader: {
    dhPublicKey: { type: String, required: true },
    previousChainLength: { type: Number, required: true },
    messageNumber: { type: Number, required: true },
  },
  preKeyId: Number,
  oneTimePreKeyId: Number,
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending',
    index: true,
  },
  deliveryReceipts: [{
    deviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
    },
    status: {
      type: String,
      enum: ['delivered', 'read'],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
  replyToMessageId: {
    type: String,
    index: true,
  },
  forwardedFrom: {
    originalSenderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    originalMessageId: String,
    forwardChain: {
      type: Number,
      default: 1,
    },
  },
  editHistory: [{
    editedAt: {
      type: Date,
      default: Date.now,
    },
    previousContent: String,
  }],
  deletedAt: {
    type: Date,
    index: true,
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 }, // TTL index for disappearing messages
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
  },
}, {
  timestamps: true,
});

// Indexes
messageEnvelopeSchema.index({ conversationId: 1, createdAt: -1 });
messageEnvelopeSchema.index({ senderId: 1, createdAt: -1 });
messageEnvelopeSchema.index({ recipientId: 1, createdAt: -1 });
messageEnvelopeSchema.index({ messageId: 1 });
messageEnvelopeSchema.index({ status: 1 });
messageEnvelopeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
messageEnvelopeSchema.index({ deletedAt: 1 });
messageEnvelopeSchema.index({ 'deliveryReceipts.deviceId': 1 });

// Methods
messageEnvelopeSchema.methods.markAsDelivered = async function(deviceId: Types.ObjectId): Promise<void> {
  const existingReceipt = this.deliveryReceipts.find(
    receipt => receipt.deviceId.equals(deviceId)
  );
  
  if (!existingReceipt) {
    this.deliveryReceipts.push({
      deviceId,
      status: 'delivered',
      timestamp: new Date(),
    });
    
    if (this.status === 'sent') {
      this.status = 'delivered';
    }
    
    await this.save();
  }
};

messageEnvelopeSchema.methods.markAsRead = async function(deviceId: Types.ObjectId): Promise<void> {
  const existingReceipt = this.deliveryReceipts.find(
    receipt => receipt.deviceId.equals(deviceId)
  );
  
  if (existingReceipt) {
    existingReceipt.status = 'read';
    existingReceipt.timestamp = new Date();
  } else {
    this.deliveryReceipts.push({
      deviceId,
      status: 'read',
      timestamp: new Date(),
    });
  }
  
  // Check if all recipient devices have read the message
  const allRead = this.deliveryReceipts.every(receipt => receipt.status === 'read');
  if (allRead) {
    this.status = 'read';
  }
  
  await this.save();
};

messageEnvelopeSchema.methods.softDelete = async function(deletedBy: Types.ObjectId): Promise<void> {
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  await this.save();
};

messageEnvelopeSchema.methods.addEdit = async function(previousContent: string): Promise<void> {
  this.editHistory.push({
    editedAt: new Date(),
    previousContent,
  });
  await this.save();
};

messageEnvelopeSchema.methods.isExpired = function(): boolean {
  return this.expiresAt && this.expiresAt < new Date();
};

messageEnvelopeSchema.methods.canBeDecrypted = function(deviceId: Types.ObjectId): boolean {
  // Logic to determine if the message can be decrypted by the given device
  return !this.recipientDeviceId || this.recipientDeviceId.equals(deviceId);
};

// Static methods
messageEnvelopeSchema.statics.getConversationMessages = async function(
  conversationId: string, 
  page: number = 1, 
  limit: number = 50
) {
  const skip = (page - 1) * limit;
  return this.find({
    conversationId,
    deletedAt: { $exists: false }
  })
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .populate('senderId', 'username displayName avatar')
  .populate('recipientId', 'username displayName avatar');
};

messageEnvelopeSchema.statics.markConversationAsRead = async function(
  conversationId: string,
  userId: Types.ObjectId,
  deviceId: Types.ObjectId
) {
  return this.updateMany(
    {
      conversationId,
      recipientId: userId,
      status: { $in: ['sent', 'delivered'] }
    },
    {
      $addToSet: {
        deliveryReceipts: {
          deviceId,
          status: 'read',
          timestamp: new Date()
        }
      },
      status: 'read'
    }
  );
};

export const MessageEnvelope = model<IMessageEnvelope, MessageEnvelopeModel>('MessageEnvelope', messageEnvelopeSchema);
export default MessageEnvelope;
