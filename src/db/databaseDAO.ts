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
 * A Data access object that establishes connection with a MongoDB database,
 * serving as a gateway to transfer information between the database and the application.
 *
 * @example
 * const dbHandler = new DatabaseDAO();
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

    /**
     * Establishes a connection to the MongoDB server.
     * Logs a success message if the connection is successful, otherwise throws an error.
     * @private
     */
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

    /**
     * Retrieves a device by its ID.
     * @param {number} id - The unique identifier of the device.
     * @returns {Promise<IDevice | null>} The device data, or null if not found.
     */
    public async getDeviceByID(id: number) {
        const device = await this.DeviceModel.findOne({ id: id });
        if (!device) {
            this.logger.error("Não foi possivel encontrar device com id: " + id);
        }
        return device;
    }

    /**
     * Creates a new device in the database or updates an existing device's connection time if it exists.
     * @param {Partial<IDevice>} values - The data for the new device.
     * @returns {Promise<number>} The ID of the created or updated device, or -1 if creation fails.
     */
    public async createDevice(values: Partial<IDevice>): Promise<number> {
        try {
            let foundDevice = await this.DeviceModel.findOne({ ip: values.ip });
            if (foundDevice) {
                if (!values.connectAt) {
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

    
    /**
     * Updates the IP address of a specified device.
     * @param {number} deviceID - The unique identifier of the device.
     * @param {string} newIP - The new IP address.
     */
    public async updateDeviceIP(deviceID: number, newIP: string) {
        try {
            await this.DeviceModel.findOneAndUpdate({ id: deviceID }, { ip: newIP });
        } catch (error) {
            this.logger.error("Não foi possivel atualizar o ip do Device.");
        }
    }

    /**
     * Updates the last connection date of a specified device.
     * @param {number} deviceID - The unique identifier of the device.
     * @param {Date} connectAt - The new connection timestamp.
     */
    public async updateDeviceConnectedAt(deviceID: number, connectAt: Date) {
        try {
            await this.DeviceModel.findOneAndUpdate({ id: deviceID }, { connectAt: connectAt });
        } catch (error) {
            this.logger.error("Não foi possivel atualizar a data de conexão do Device.");
        }
    }

    /**
     * Adds a task to each device in a list of device IDs.
     * @param {number} taskID - The unique identifier of the task.
     * @param {number[]} deviceList - List of device IDs to associate with the task.
     */
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

    /**
     * Removes a device by its ID.
     * @param {number} id - The unique identifier of the device to remove.
     * @returns {Promise<IDevice | null>} The removed device data, or null if not found.
     */
    public async removeDevice(id: number) {
        return await this.DeviceModel.findOneAndDelete({ id });
    }
    //#endregion ============== Device Operations ==============

    //#region ============== Task Operations ==============
    
    /**
     * Creates a new task in the database.
     * @param {Partial<ITask>} values - The data for the new task.
     * @returns {Promise<number>} The ID of the created task, or -1 if creation fails.
     */
    public async createTask(values: Partial<ITask>) {
        if(!values.metrics || Object.keys(values.metrics).length === 0){
            this.logger.error("A task com id " + values.id + " não tem lista de devices!");
            return -1;
        }

        //Esta parte então não é necessária
        /*
        const deviceIds = Object.keys(values.metrics).map(id => parseInt(id, 10));

        const existingDevices = await DeviceModel.find({ id: { $in: deviceIds } }).select('id').exec();
        const existingDeviceIds = existingDevices.map(device => device.id);

        const allDevicesExist = deviceIds.every(deviceId => existingDeviceIds.includes(deviceId));
        if (!allDevicesExist) {
            this.logger.error("Um ou mais dispositivos especificados em metrics não são válidos.");
            return -1;
        }
        */

        const lastTask = await this.TaskModel.findOne().sort({ id: 'descending' });
        const newId = lastTask ? lastTask.id + 1 : 1;

        const task = new this.TaskModel({
            ...values,
            id: newId,
        });

        await task.save();

        return newId;
    }

    /**
     * Retrieves a task by its ID.
     * @param {number} id - The unique identifier of the task.
     * @returns {Promise<ITask | null>} The task data, or null if not found.
     */
    public async getTaskByID(id: number) {
        return await this.TaskModel.findOne({ id });
    }

    /**
     * Removes a task by its ID.
     * @param {number} id - The unique identifier of the task to remove.
     * @returns {Promise<ITask | null>} The removed task data, or null if not found.
     */
    public async removeTask(id: number) {
        return await this.TaskModel.findOneAndDelete({ id });
    }

    /**
     * Adds metrics for a specific device within a task.
     * @param {number} taskId - The unique identifier of the task.
     * @param {number} deviceId - The unique identifier of the device.
     * @param {Object.<string, number>} metrics - Metrics data to add.
     */
    public async addMetrics(taskId: number, deviceId: number, metrics: { [key: string]: number }) {
        const task = await this.getTaskByID(taskId);
        if (task) {
            if (!task.metrics[deviceId]) {
                task.metrics[deviceId] = {};
            }
    
            for (const [metricName, metricValue] of Object.entries(metrics)) {
                
                if (!task.metrics[deviceId][metricName]) {
                    task.metrics[deviceId][metricName] = { values: [], timestamps: [] };
                }
    
                task.metrics[deviceId][metricName].values.push(metricValue);
                task.metrics[deviceId][metricName].timestamps.push(new Date().toISOString());
            }
    
            task.markModified(`metrics.${deviceId}`);
    
            await task.save();
        } else {
            this.logger.error("Task não encontrada!");
        }    
    }

    /**
     * Retrieves metrics for a specific device within a task.
     * @param {number} taskId - The unique identifier of the task.
     * @param {number} deviceId - The unique identifier of the device.
     * @returns {Promise<Object | null>} The metrics for the device, or null if not found.
     */
    public async getMetrics(taskId: number, deviceId: number) {
        const task = await this.getTaskByID(taskId);
        if (task && task.metrics[deviceId]) {
            return task.metrics[deviceId];
        }
        return null;
    }    

    //#endregion

    //#region ============== Printing Methods ==============
    /**
     * Logs a list of all devices in the database.
     */
    public async printDevices() {
        const devices = await this.DeviceModel.find()
            .select('id ip connectAt')
            .sort({ id: 1 })
            .lean();
    
        devices.forEach(device => {
            this.logger.log(`Device ID: ${device.id}, IP: ${device.ip}, Connected At: ${device.connectAt}`);
        });
    }

    /**
     * Logs a list of all tasks in the database.
     */
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

    /**
     * Logs the metrics for a specific device within a specific task.
     * @param {number} taskId - The unique identifier of the task.
     * @param {number} deviceId - The unique identifier of the device.
     */
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

    //#endregion

    /**
     * Drops the database after confirming with the user.
     * P.S: This is ChatGPT's mumboJumbo
     * 
     */
    public async dropDatabase() {
        process.stdout.write('Are you sure you want to drop the database? [Y/n] \n');

        await new Promise<void>((resolve) => {
            process.stdin.setRawMode(true); 
            process.stdin.resume();

            process.stdin.once('data', async (data) => {
                const confirmation = data.toString().toLowerCase();
                process.stdin.setRawMode(false);
                process.stdin.pause();

                if (confirmation === 'y') {
                    try {
                        await mongoose.connection.dropDatabase();
                        this.logger.success('Database dropped successfully.');
                    } catch (error) {
                        this.logger.error('Failed to drop the database:', error);
                    }
                } else {
                    this.logger.info('Database drop canceled.');
                }
                resolve();
            });
        });
    }
}

export { DatabaseDAO };
