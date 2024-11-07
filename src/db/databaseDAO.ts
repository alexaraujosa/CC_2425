/**
 * @module DatabaseDAO
 * A Class that composes a list of methods to add, remove and update values.
 *
 * 
 * Copyright (c) 2024 Pauloarf https://github.com/Pauloarf
 */

import mongoose, { Model } from 'mongoose';
import DeviceModel from './models/deviceModel.js';
import TaskModel from './models/taskModel.js';
import { IDevice } from './interfaces/IDevice.js';
import { ITask } from './interfaces/ITask.js';
import { getOrCreateGlobalLogger } from "$common/util/logger.js";

const MONGO_URL = 'mongodb://localhost:27017/CCDatabase';

/**
 * A Data access object that establishes connection with a database, serving as gateway to transfer information between the db and the aplication. 
 * 
 * @example
 * const dbHandler = const dbHandler = new DatabaseDAO();
 * dbHandler.createDevice(newDeviceData);
 */

class DatabaseDAO {
    private logger = getOrCreateGlobalLogger({printCallerFile: true, debug: true});
    private DeviceModel: Model<IDevice>;
    private TaskModel: Model<ITask>;

    constructor() {
        this.connect();

        this.DeviceModel = DeviceModel;
        this.TaskModel = TaskModel;
    }

    // Método privado usado para establecer a conexão ao servidor
    private async connect() {
        try {
            await mongoose.connect(MONGO_URL);
            this.logger.success('Conectado ao MongoDB na database CCDatabase');
        } catch (error) {
            this.logger.error('Erro ao conectar ao MongoDB:');
            throw error;
        }
    }

    //#region ============== Device Operations ==============
    public async getDeviceByID(id: number) {
        const device = await this.DeviceModel.findOne({ id: id });
        if(!device){
            this.logger.error("Não foi possivel encontrar device com id: " + id);
        }
        return device; 
    }

    public async createDevice(values: Partial<IDevice>): Promise<number> {
        try {
            let foundDevice = await this.DeviceModel.findOne({ip: values.ip})
            if(foundDevice){
                if(!values.connectAt){
                    this.logger.warn("Os valores que passou como parametro não chegam para criar device.");
                    return -1;
                }
                this.updateDeviceConnectedAt(foundDevice.id, values.connectAt);
                this.logger.info("O dispositivo já existe e foi atualizado.");
                return foundDevice.id;
            }
            
            const lastDevice = await this.DeviceModel.findOne().sort({ id: 'descending' });
            const newId = lastDevice ? lastDevice.id + 1 : 1;

            const device = new this.DeviceModel({
                ...values,
                id: newId,
            });

            await device.save();

            return newId;
        } catch (error) {
            this.logger.error('Erro ao criar dispositivo:');
            return -1;
        }
    }

    public async updateDeviceIP(deviceID: number, newIP: string){
        try{
            await this.DeviceModel.findOneAndUpdate({id: deviceID}, {ip: newIP});
        } catch (error) {
            this.logger.error("Não foi possivel atualizar o ip do Device.");
        }
    }

    public async updateDeviceConnectedAt(deviceID: number, connectAt: Date){
        try{
            await this.DeviceModel.findOneAndUpdate({id: deviceID}, {connectAt: connectAt});
        } catch (error) {
            this.logger.error("Não foi possivel atualizar a data de conexão do Device.");
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
                this.logger.warn(`Dispositivo com ID ${deviceId} não encontrado.`);
            }
        }
    }

    public async removeDevice(id: number) {
        return await this.DeviceModel.findOneAndDelete({ id });
    }
    //#region ============== Device Operations ==============

    // Métodos CRUD para Task
    public async createTask(values: Partial<ITask>) {
        if(!values.metrics || Object.keys(values.metrics).length === 0){
            this.logger.error("A task com id " + values.id + " não tem lista de devices!");
            return -1;
        }

        const deviceIds = Object.keys(values.metrics).map(id => parseInt(id, 10));

        const existingDevices = await DeviceModel.find({ id: { $in: deviceIds } }).select('id').exec();
        const existingDeviceIds = existingDevices.map(device => device.id);

        const allDevicesExist = deviceIds.every(deviceId => existingDeviceIds.includes(deviceId));
        if (!allDevicesExist) {
            this.logger.error("Um ou mais dispositivos especificados em metrics não são válidos.");
            return -1;
        }

        const lastTask = await this.TaskModel.findOne().sort({ id: 'descending' });
        const newId = lastTask ? lastTask.id + 1 : 1;

        const task = new this.TaskModel({
            ...values,
            id: newId,
        });

        await task.save();

        return newId;
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
            if (!task.metrics[deviceId]) {
                task.metrics[deviceId] = {};
            }
    
            // Adiciona as métricas fornecidas
            for (const [metricName, metricValue] of Object.entries(metrics)) {
                
                // Inicializa a estrutura da métrica se não existir
                if (!task.metrics[deviceId][metricName]) {
                    task.metrics[deviceId][metricName] = { values: [], timestamps: [] };
                }
    
                // Adiciona o valor e o timestamp
                task.metrics[deviceId][metricName].values.push(metricValue);
                task.metrics[deviceId][metricName].timestamps.push(new Date().toISOString());
            }
    
            // Marca o campo 'metrics' como modificado para garantir que o Mongoose detecte mudanças
            task.markModified(`metrics.${deviceId}`);
    
            await task.save(); // Salva as mudanças no banco de dados
        } else {
            this.logger.error("Task não encontrada!");
        }    
    }

    public async getMetrics(taskId: number, deviceId: number) {
        const task = await this.getTaskByID(taskId);
        if (task && task.metrics[deviceId]) {
            return task.metrics[deviceId]; // Retorna todas as métricas para o deviceId
        }
        return null; // Retorna null se a task ou metrics não forem encontradas
    }    

    public async printDevices() {
        const devices = await this.DeviceModel.find()
            .select('id ip connectAt')
            .sort({ id: 1 })
            .lean();
    
        devices.forEach(device => {
            this.logger.log(`Device ID: ${device.id}, IP: ${device.ip}, Connected At: ${device.connectAt}`);
        });
    }

    public async printTasks() {
        const tasks = await this.TaskModel.find()
            .select('id frequency metrics')
            .lean();
    
        tasks.forEach(task => {
            const deviceIds = Object.keys(task.metrics).map(id => parseInt(id, 10));
            
            const frequencyInSeconds = task.frequency * 60;
    
            this.logger.log(`Task ID: ${task.id}, Frequency: ${frequencyInSeconds} seconds, Devices: [${deviceIds.join(', ')}]`);
        });
    }

    public async printDeviceTaskMetrics(taskId: number, deviceId: number) {
        const task = await this.TaskModel.findOne({ id: taskId }).lean();
    
        if (!task) {
            this.logger.error(`Task with ID ${taskId} not found.`);
            return;
        }
    
        const deviceMetrics = task.metrics[deviceId];
        if (!deviceMetrics) {
            this.logger.error(`Device with ID ${deviceId} not found in Task ${taskId}.`);
            return;
        }
    
        this.logger.log(`Metrics for Device ID: ${deviceId} in Task ID: ${taskId}`);
        Object.entries(deviceMetrics).forEach(([metricName, data]) => {
            this.logger.log(`Metric: ${metricName}`);
            
            // Mostrar pares de valores e timestamps
            for (let i = 0; i < data.values.length; i++) {
                this.logger.log(`  Value: ${data.values[i]}, Timestamp: ${data.timestamps[i]}`);
            }
        });
    }
}

export { DatabaseDAO };
