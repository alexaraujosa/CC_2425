import mongoose, { Schema, Model } from 'mongoose';
import { IDevice } from '../interfaces/IDevice.js';

// Esquema do Mongoose para o dispositivo
const DeviceSchema = new Schema<IDevice>({
    id: { type: Number, required: true, unique: true },
    ip: { type: String, required: true, unique: true },
    auth: {
        public_key: { type: Number, required: true },
        private_key: { type: Number, required: true },
        salt: { type: String, required: true }
    },
    tasks: [{ type: Number }],
    connectAt: { type: Date, default: Date.now },
});

// Modelo do Mongoose
const DeviceModel: Model<IDevice> = mongoose.model<IDevice>('Device', DeviceSchema);
export default DeviceModel;
