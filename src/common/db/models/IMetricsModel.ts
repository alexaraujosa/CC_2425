import mongoose, { Schema, Model } from 'mongoose';
import { IMetrics } from '../interfaces/IMetrics.js';

// Metrics schema - Defines mongoDB Schema
const MetricsSchema = new Schema<IMetrics>({
    taskID: { type: Number, required: true },
    deviceSessionID: { type: Buffer, required: true },
    metrics: {
        type: Object,  // Aqui usamos 'Object' ao invés de 'Map'
        required: true
    }
});
MetricsSchema.index({taskID: 1, deviceSessionID: 1}, {unique: true})

// Mongoose model for the Metrics schema.
const metricsModel: Model<IMetrics> = mongoose.model<IMetrics>('Metrics', MetricsSchema);
export default metricsModel;
