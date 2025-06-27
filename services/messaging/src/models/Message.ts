import mongoose from 'mongoose';
import { MessageType, MessageChannel, MessageStatus } from '../types';

const MessageSchema = new mongoose.Schema({
  familyId: {
    type: String,
    required: true,
    index: true
  },
  senderId: {
    type: String,
    required: false
  },
  recipientIds: [{
    type: String,
    required: true
  }],
  messageType: {
    type: String,
    enum: Object.values(MessageType),
    required: true
  },
  channel: {
    type: String,
    enum: Object.values(MessageChannel),
    required: true
  },
  subject: String,
  content: {
    type: String,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: Object.values(MessageStatus),
    default: MessageStatus.PENDING
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  scheduledAt: Date,
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  failureReason: String,
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  }
}, {
  timestamps: true,
  collection: 'family_messages'
});

MessageSchema.index({ familyId: 1, createdAt: -1 });
MessageSchema.index({ status: 1, scheduledAt: 1 });
MessageSchema.index({ recipientIds: 1 });

MessageSchema.methods.markAsSent = function() {
  this.status = MessageStatus.SENT;
  this.sentAt = new Date();
  return this.save();
};

MessageSchema.methods.markAsDelivered = function() {
  this.status = MessageStatus.DELIVERED;
  this.deliveredAt = new Date();
  return this.save();
};

MessageSchema.methods.markAsRead = function() {
  this.status = MessageStatus.READ;
  this.readAt = new Date();
  return this.save();
};

MessageSchema.methods.markAsFailed = function(reason: string) {
  this.status = MessageStatus.FAILED;
  this.failureReason = reason;
  this.retryCount += 1;
  return this.save();
};

MessageSchema.methods.canRetry = function(): boolean {
  return this.retryCount < this.maxRetries;
};

export const Message = mongoose.model('Message', MessageSchema);