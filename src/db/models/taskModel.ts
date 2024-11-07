import mongoose, { Schema, Model } from 'mongoose';
import { ITask } from '../interfaces/ITask.js';

const TaskSchema = new Schema<ITask>({
    id: { type: Number, required: true, unique: true },
    frequency: { type: Number, required: true },
    metrics: { type: Schema.Types.Mixed, default: {} } // Schema flexível para dados adicionais
});

// Modelo do Mongoose
const TaskModel: Model<ITask> = mongoose.model<ITask>('Task', TaskSchema);

export default TaskModel;
