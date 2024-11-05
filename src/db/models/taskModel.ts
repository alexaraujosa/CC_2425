import mongoose, { Schema, Model } from 'mongoose';
import { ITask } from '../interfaces/ITask.js';

const TaskSchema = new Schema<ITask>({
    id: { type: Number, required: true, unique: true },
    frequency: { type: Number, required: true },
    devices: {
        type: [{ type: Number }],
        validate: [
            {
                validator: (devicesArray: number[]) => devicesArray.length > 0,
                message: 'Número de dispositivos de uma task tem de ser superior a 0.'
            },
            {
                validator: async (devicesArray: number[]) => {
                    const devices = await mongoose.model('Device').find({ id: { $in: devicesArray } });
                    return devicesArray.every((value) => devices.some((v) => v.id === value));
                },
                message: 'Todos os IDs de dispositivos devem existir na coleção de dispositivos.'
            },
        ],
        required: true
    },
    metrics: { type: Schema.Types.Mixed, default: {} } // Schema flexível para dados adicionais
});

// Modelo do Mongoose
const TaskModel: Model<ITask> = mongoose.model<ITask>('Task', TaskSchema);

export default TaskModel;
