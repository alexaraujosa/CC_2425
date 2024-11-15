import mongoose, { Schema, Model } from 'mongoose';
import { ITask } from '../interfaces/ITask.js';

// Task schema - Defines mongoDB Schema
const TaskSchema = new Schema<ITask>({
    id: { type: Number, required: true, unique: true },
    frequency: { type: Number, required: true },
    device_metrics: { type: [String], required: false},
    global_options: { 
        mode: { type: String, enum: ["client", "server"], required: false },
        target: { type: String, required: false },
        duration: { type: Number, required: false },
        transport: { type: String, enum: ["tcp", "udp"], required: false },
        interval: { type: Number, required: false },
        counter: { type: Number, required: false }
    },
    link_metrics: {
        type: Map,
        of: {
            mode: { type: String, enum: ["client", "server"], required: false },
            target: { type: String, required: false },
            duration: { type: Number, required: false},
            transport: { type: String, enum: ["tcp", "udp"], required: false },
            interval: { type: Number, required: false },
            counter: { type: Number, required: false }
        },
    },
    alert_conditions: { 
        cpu_usage: { type: Number, required: false },
        ram_usage: { type: Number, required: false },
        interface_stats: { type: Number, required: false },
        packet_loss: { type: Number, required: false },
        jitter: { type: Number, required: false }
    }
});

// Mongoose model for the Task schema.
const taskModel: Model<ITask> = mongoose.model<ITask>('Task', TaskSchema);
export default taskModel;
