import mongoose, { Schema, Model } from 'mongoose';
import { IDevice } from '../interfaces/IDevice.js';

// Device schema - Defines mongoDB Schema
const DeviceSchema = new Schema<IDevice>({
    id: { type: Number, required: true, unique: true},
    ip: { type: String, required: true, unique: true },
    port: {type: Number, required: true},
    auth: {
        secret: { type: Buffer, required: true },
        salt: { type: Buffer, required: true },
        sessionId: {type: Buffer},
    },
    connectAt: { type: Date, default: Date.now },
});

// Mongoose model for the Device schema.
const deviceModel: Model<IDevice> = mongoose.model<IDevice>('Device', DeviceSchema);
export default deviceModel;
