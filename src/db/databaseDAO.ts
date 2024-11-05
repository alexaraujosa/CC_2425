import mongoose, { Model } from 'mongoose';
import DeviceModel from './models/deviceModel.js';
import TaskModel from './models/taskModel.js';
import { IDevice } from './interfaces/IDevice.js';
import { ITask } from './interfaces/ITask.js';

const MONGO_URL = 'mongodb://localhost:27017/CCDatabase';

class DatabaseDAO {
    private DeviceModel: Model<IDevice>;
    private TaskModel: Model<ITask>;

    constructor() {
        this.connect();

        this.DeviceModel = DeviceModel;
        this.TaskModel = TaskModel;
    }

    // Método para conectar ao MongoDB
    private async connect() {
        try {
            await mongoose.connect(MONGO_URL);
            console.log('Conectado ao MongoDB no banco CCDatabase');
        } catch (error) {
            console.error('Erro ao conectar ao MongoDB:', error);
            throw error;
        }
    }

    // Métodos CRUD para Device
    public async createDevice(values: Partial<IDevice>): Promise<number> {
        try {
            const lastDevice = await this.DeviceModel.findOne().sort({ id: -1 });
            const newId = lastDevice ? lastDevice.id + 1 : 1; // Se não há dispositivos, o `id` começa em 1

            // 2. Criar o dispositivo com o novo `id`
            const device = new this.DeviceModel({
                ...values,
                id: newId,  // Atribui o novo `id` ao dispositivo
            });

            // 3. Salvar o dispositivo
            await device.save();

            return newId;  // Retorna o novo `id` caso o dispositivo seja criado com sucesso
        } catch (error) {
            console.error('Erro ao criar dispositivo:', error);
            return -1;  // Retorna -1 em caso de erro
        }
    }


    public async updateDeviceTasks(taskID: number, deviceList: number[]) {
        for (const deviceId of deviceList) {
            const device = await this.getDeviceByID(deviceId);
    
            if (device) {
                if (!device.tasks.includes(taskID)) {
                    device.tasks.push(taskID);
    
                    await device.save();
                }
            } else {
                console.warn(`Dispositivo com ID ${deviceId} não encontrado.`);
            }
        }
    }
    

    public async getDevices() {
        return await this.DeviceModel.find();
    }

    public async getDeviceByID(id: number) {
        return await this.DeviceModel.findOne({ id });
    }

    public async removeDevice(id: number) {
        return await this.DeviceModel.findOneAndDelete({ id });
    }

    // Métodos CRUD para Task
    public async createTask(values: Partial<ITask>) {
        const task = new this.TaskModel(values);
        this.updateDeviceTasks(task.id, task.devices);
        return await task.save();
    }

    public async getTasks() {
        return await this.TaskModel.find();
    }

    public async getTaskByID(id: number) {
        return await this.TaskModel.findOne({ id });
    }

    public async removeTask(id: number) {
        return await this.TaskModel.findOneAndDelete({ id });
    }

    public async addMetrics(taskId: number, deviceId: number, metrics: { [key: string]: number }) {
        const task = await this.getTaskByID(taskId);
        if (task) {
            // Inicializa a estrutura de métricas para o deviceId se não existir
            if (!task.metrics[deviceId]) {
                task.metrics[deviceId] = {};
            }
    
            // Adiciona as métricas fornecidas
            for (const [metricName, metricValue] of Object.entries(metrics)) {
                console.log(metricName, metricValue);
                
                // Inicializa a estrutura da métrica se não existir
                if (!task.metrics[deviceId][metricName]) {
                    task.metrics[deviceId][metricName] = { values: [], timestamps: [] };
                }
    
                // Adiciona o valor e o timestamp
                task.metrics[deviceId][metricName].values.push(metricValue);
                task.metrics[deviceId][metricName].timestamps.push(new Date().toISOString());
                console.log(task.metrics[deviceId][metricName]);
            }
    
            // Marca o campo 'metrics' como modificado para garantir que o Mongoose detecte mudanças
            task.markModified(`metrics.${deviceId}`);
    
            await task.save(); // Salva as mudanças no banco de dados
        } else {
            console.error("Task não encontrada!");
        }    
    }
    


    public async getMetrics(taskId: number, deviceId: number) {
        const task = await this.getTaskByID(taskId);
        if (task && task.metrics[deviceId]) {
            return task.metrics[deviceId]; // Retorna todas as métricas para o deviceId
        }
        return null; // Retorna null se a task ou metrics não forem encontradas
    }    
    
}

export { DatabaseDAO };
