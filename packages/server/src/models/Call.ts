import { Schema, model, Document, Types, Model } from 'mongoose';

export interface ICall extends Document {
  _id: Types.ObjectId;
  callId: string; // Unique identifier for the call
  initiatorId: Types.ObjectId;
  participantIds: Types.ObjectId[];
  callType: 'audio' | 'video' | 'screen_share';
  status: 'initiated' | 'ringing' | 'accepted' | 'rejected' | 'missed' | 'ended' | 'failed';
  isGroupCall: boolean;
  encryption: {
    enabled: boolean;
    keyExchange: 'DTLS-SRTP' | 'E2E-Custom';
    masterKey?: string; // Encrypted master key
    saltKey?: string;
  };
  signaling: {
    iceServers: Array<{
      urls: string[];
      username?: string;
      credential?: string;
    }>;
    turnServers: Array<{
      urls: string[];
      username: string;
      credential: string;
    }>;
  };
  participants: Array<{
    userId: Types.ObjectId;
    deviceId: Types.ObjectId;
    joinedAt?: Date;
    leftAt?: Date;
    status: 'invited' | 'ringing' | 'joined' | 'left' | 'rejected';
    audioEnabled: boolean;
    videoEnabled: boolean;
    screenShareEnabled: boolean;
    connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
    networkStats?: {
      bitrate: number;
      packetLoss: number;
      latency: number;
      jitter: number;
    };
  }>;
  duration: number; // Duration in seconds
  quality: {
    avgBitrate: number;
    avgPacketLoss: number;
    avgLatency: number;
    connectionDrops: number;
  };
  recording: {
    enabled: boolean;
    recordingId?: string;
    startedAt?: Date;
    endedAt?: Date;
    fileSize?: number;
    filePath?: string;
  };
  endReason: 'user_ended' | 'timeout' | 'network_error' | 'server_error' | 'declined';
  metadata: {
    clientVersion: string;
    serverRegion: string;
    networkType?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ICallMethods {
  addParticipant(userId: Types.ObjectId, deviceId: Types.ObjectId): Promise<void>;
  removeParticipant(userId: Types.ObjectId): Promise<void>;
  updateParticipantStatus(userId: Types.ObjectId, status: string): Promise<void>;
  updateParticipantMedia(userId: Types.ObjectId, audio: boolean, video: boolean, screenShare: boolean): Promise<void>;
  startCall(): Promise<void>;
  endCall(reason: string): Promise<void>;
  updateQuality(stats: any): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
  generateCallSummary(): any;
}

type CallModel = Model<ICall, {}, ICallMethods>;

const callSchema = new Schema<ICall, CallModel, ICallMethods>({
  callId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  initiatorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  participantIds: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
  callType: {
    type: String,
    enum: ['audio', 'video', 'screen_share'],
    required: true,
  },
  status: {
    type: String,
    enum: ['initiated', 'ringing', 'accepted', 'rejected', 'missed', 'ended', 'failed'],
    default: 'initiated',
    index: true,
  },
  isGroupCall: {
    type: Boolean,
    default: false,
  },
  encryption: {
    enabled: { type: Boolean, default: true },
    keyExchange: {
      type: String,
      enum: ['DTLS-SRTP', 'E2E-Custom'],
      default: 'DTLS-SRTP',
    },
    masterKey: String,
    saltKey: String,
  },
  signaling: {
    iceServers: [{
      urls: [String],
      username: String,
      credential: String,
    }],
    turnServers: [{
      urls: [String],
      username: { type: String, required: true },
      credential: { type: String, required: true },
    }],
  },
  participants: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    deviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Device',
      required: true,
    },
    joinedAt: Date,
    leftAt: Date,
    status: {
      type: String,
      enum: ['invited', 'ringing', 'joined', 'left', 'rejected'],
      default: 'invited',
    },
    audioEnabled: { type: Boolean, default: true },
    videoEnabled: { type: Boolean, default: false },
    screenShareEnabled: { type: Boolean, default: false },
    connectionQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor', 'unknown'],
      default: 'unknown',
    },
    networkStats: {
      bitrate: Number,
      packetLoss: Number,
      latency: Number,
      jitter: Number,
    },
  }],
  duration: {
    type: Number,
    default: 0,
  },
  quality: {
    avgBitrate: { type: Number, default: 0 },
    avgPacketLoss: { type: Number, default: 0 },
    avgLatency: { type: Number, default: 0 },
    connectionDrops: { type: Number, default: 0 },
  },
  recording: {
    enabled: { type: Boolean, default: false },
    recordingId: String,
    startedAt: Date,
    endedAt: Date,
    fileSize: Number,
    filePath: String,
  },
  endReason: {
    type: String,
    enum: ['user_ended', 'timeout', 'network_error', 'server_error', 'declined'],
  },
  metadata: {
    clientVersion: String,
    serverRegion: String,
    networkType: {
      type: String,
      enum: ['wifi', 'cellular', 'ethernet', 'unknown'],
    },
  },
}, {
  timestamps: true,
});

// Indexes
callSchema.index({ callId: 1 });
callSchema.index({ initiatorId: 1, createdAt: -1 });
callSchema.index({ participantIds: 1, createdAt: -1 });
callSchema.index({ status: 1 });
callSchema.index({ callType: 1 });
callSchema.index({ createdAt: -1 });
callSchema.index({ duration: -1 });
callSchema.index({ 'participants.userId': 1 });

// Methods
callSchema.methods.addParticipant = async function(userId: Types.ObjectId, deviceId: Types.ObjectId): Promise<void> {
  // Check if participant already exists
  const existingParticipant = this.participants.find(p => p.userId.equals(userId));
  if (existingParticipant) {
    return;
  }

  this.participants.push({
    userId,
    deviceId,
    status: 'invited',
    audioEnabled: true,
    videoEnabled: this.callType === 'video',
    screenShareEnabled: false,
    connectionQuality: 'unknown',
  });

  if (!this.participantIds.includes(userId)) {
    this.participantIds.push(userId);
  }

  this.isGroupCall = this.participants.length > 2;
  await this.save();
};

callSchema.methods.removeParticipant = async function(userId: Types.ObjectId): Promise<void> {
  const participantIndex = this.participants.findIndex(p => p.userId.equals(userId));
  if (participantIndex > -1) {
    this.participants[participantIndex].status = 'left';
    this.participants[participantIndex].leftAt = new Date();
  }

  // Check if call should end (no active participants)
  const activeParticipants = this.participants.filter(p => p.status === 'joined');
  if (activeParticipants.length <= 1 && this.status === 'accepted') {
    this.status = 'ended';
    this.endReason = 'user_ended';
    this.duration = Math.floor((Date.now() - this.createdAt.getTime()) / 1000);
  }

  await this.save();
};

callSchema.methods.updateParticipantStatus = async function(userId: Types.ObjectId, status: string): Promise<void> {
  const participant = this.participants.find(p => p.userId.equals(userId));
  if (participant) {
    participant.status = status as any;
    
    if (status === 'joined' && !participant.joinedAt) {
      participant.joinedAt = new Date();
    } else if (status === 'left' && !participant.leftAt) {
      participant.leftAt = new Date();
    }
  }

  // Update call status based on participant statuses
  if (status === 'joined' && this.status === 'ringing') {
    this.status = 'accepted';
  }

  await this.save();
};

callSchema.methods.updateParticipantMedia = async function(
  userId: Types.ObjectId, 
  audio: boolean, 
  video: boolean, 
  screenShare: boolean
): Promise<void> {
  const participant = this.participants.find(p => p.userId.equals(userId));
  if (participant) {
    participant.audioEnabled = audio;
    participant.videoEnabled = video;
    participant.screenShareEnabled = screenShare;
  }
  await this.save();
};

callSchema.methods.startCall = async function(): Promise<void> {
  this.status = 'ringing';
  await this.save();
};

callSchema.methods.endCall = async function(reason: string): Promise<void> {
  this.status = 'ended';
  this.endReason = reason as any;
  this.duration = Math.floor((Date.now() - this.createdAt.getTime()) / 1000);
  
  // Update all active participants to 'left'
  this.participants.forEach(participant => {
    if (participant.status === 'joined') {
      participant.status = 'left';
      participant.leftAt = new Date();
    }
  });

  await this.save();
};

callSchema.methods.updateQuality = async function(stats: any): Promise<void> {
  // Update average quality metrics
  const participantCount = this.participants.filter(p => p.status === 'joined').length;
  
  if (participantCount > 0) {
    this.quality.avgBitrate = (this.quality.avgBitrate + stats.bitrate) / 2;
    this.quality.avgPacketLoss = (this.quality.avgPacketLoss + stats.packetLoss) / 2;
    this.quality.avgLatency = (this.quality.avgLatency + stats.latency) / 2;
  }

  await this.save();
};

callSchema.methods.startRecording = async function(): Promise<void> {
  this.recording.enabled = true;
  this.recording.startedAt = new Date();
  this.recording.recordingId = `rec_${this.callId}_${Date.now()}`;
  await this.save();
};

callSchema.methods.stopRecording = async function(): Promise<void> {
  this.recording.endedAt = new Date();
  await this.save();
};

callSchema.methods.generateCallSummary = function(): any {
  const duration = this.duration || Math.floor((Date.now() - this.createdAt.getTime()) / 1000);
  
  return {
    callId: this.callId,
    type: this.callType,
    duration,
    participants: this.participants.length,
    quality: this.quality,
    status: this.status,
    encryption: this.encryption.enabled,
    recording: this.recording.enabled,
  };
};

// Static methods
callSchema.statics.getUserCallHistory = async function(
  userId: Types.ObjectId, 
  page: number = 1, 
  limit: number = 20
) {
  const skip = (page - 1) * limit;
  return this.find({
    $or: [
      { initiatorId: userId },
      { participantIds: userId }
    ]
  })
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .populate('initiatorId', 'username displayName avatar')
  .populate('participantIds', 'username displayName avatar');
};

callSchema.statics.getActiveCallsForUser = async function(userId: Types.ObjectId) {
  return this.find({
    $or: [
      { initiatorId: userId },
      { participantIds: userId }
    ],
    status: { $in: ['initiated', 'ringing', 'accepted'] }
  });
};

export const Call = model<ICall, CallModel>('Call', callSchema);
export default Call;
