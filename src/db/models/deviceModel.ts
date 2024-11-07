import mongoose, { Schema, Model } from 'mongoose';
import { IDevice } from '../interfaces/IDevice.js';

// Esquema do Mongoose para o dispositivo
const DeviceSchema = new Schema<IDevice>({
    id: { type: Number, required: true, unique: true },
    ip: { type: String, required: true, unique: true },
    port: {type: Number, required: true},
    auth: {
        public_key: { type: Buffer, required: true },
        private_key: { type: Buffer, required: true },
        salt: { type: Buffer, required: true },
        sessionId: {type: Buffer},
    },
    tasks: [{ type: Number }],
    connectAt: { type: Date, default: Date.now },
});

// Modelo do Mongoose
const DeviceModel: Model<IDevice> = mongoose.model<IDevice>('Device', DeviceSchema);
export default DeviceModel;
