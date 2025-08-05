import { Schema, model, Document, Types } from 'mongoose';

export interface IPendingApproval extends Document {
  _id: Types.ObjectId;
  type: 'device' | 'user';
  deviceId?: Types.ObjectId;
  userId: Types.ObjectId;
  riskScore: number;
  reasons: string[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

const PendingApprovalSchema = new Schema<IPendingApproval>({
  type: {
    type: String,
    enum: ['device', 'user'],
    required: true,
  },
  deviceId: {
    type: Schema.Types.ObjectId,
    ref: 'Device',
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  riskScore: {
    type: Number,
    required: true,
  },
  reasons: [{
    type: String,
    required: true,
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const PendingApproval = model<IPendingApproval>('PendingApproval', PendingApprovalSchema);
export default PendingApproval;
