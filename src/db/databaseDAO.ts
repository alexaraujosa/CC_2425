/**
 * @module DatabaseDAO
 * A Class that composes a list of methods to add, remove and update values.
 *
 * 
 * Copyright (c) 2024 Pauloarf https://github.com/Pauloarf
 */

import mongoose, { Model } from 'mongoose';
import { IDevice } from './interfaces/IDevice.js';
import { ITask } from './interfaces/ITask.js';
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { IMetrics } from './interfaces/IMetrics.js';
import deviceModel from './models/deviceModel.js';
import taskModel from './models/taskModel.js';
import metricsModel from './models/IMetricsModel.js';

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
    private deviceModel: Model<IDevice>;
    private taskModel: Model<ITask>;
    private metricsModel: Model<IMetrics>;

    /**
     * Creates the Data Access Object.
     * When created it establishes a connection to the MongoDB server and associates the Models automatically
     */
    constructor() {
        this.connect();
        this.deviceModel = deviceModel;
        this.taskModel = taskModel;
        this.metricsModel = metricsModel;
    }

    /**
     * Establishes a connection to the MongoDB server.
     * Logs a success message if the connection is successful, otherwise throws an error.
     * @private
     * @throws Throws an error when the connection could'nt be established.
     */
    private async connect() {
        try {
            await mongoose.connect(MONGO_URL);
            this.logger.success(`Conectado ao MongoDB na database ${MONGO_URL.slice( MONGO_URL.lastIndexOf('/'), MONGO_URL.length)}`);
        } catch (error) {
            throw new Error('Erro ao conectar ao MongoDB:');
            throw error;
        }
    }

    //#region ============== Device Operations ==============
    /**
     * Creates a new device in the database or updates an existing device's connection time if it exists.
     * @param {Partial<IDevice>} values - The data for the new device.
     * @returns {Promise<number>} The ID of the created or updated device, or -1 if creation fails.
     * @throws 
     */
    public async createDevice(values: Partial<IDevice>): Promise<number> {
        let foundDevice = await this.deviceModel.findOne({ ip: values.ip });
        
        if (foundDevice) {
            this.updateDevice(foundDevice.ip, values);
            await foundDevice.save();
            return foundDevice.id;
        }

        const lastDevice = await this.deviceModel.findOne().sort({ id: 'descending' });
        const newId = lastDevice ? lastDevice.id + 1 : 1;

        const device = new this.deviceModel({
            ...values,
            id: newId,
        });

        await device.save();
        return newId;
    }
    
   /**
     * Retrieves a device by its IP.
     * @param {string} ip - The unique identifier of the device.
     * @returns {Promise<IDevice | null>} The device data, or null if not found.
     * @throws Throws an error when the device does not exist.
     */
    public async getDeviceByIP(ip: string): Promise<IDevice | null> { // Change `ip` type to string
        const device = await this.deviceModel.findOne({ ip: ip });
        if (!device) {
            throw new Error("Não foi possível encontrar dispositivo com ip: " + ip);
        }
        return device;
    }

    /**
     * Retrieves a device by its unique identifier.
     * @param {number} id - The unique identifier of the device.
     * @returns {Promise<IDevice | null>} The device data, or null if not found.
     * @throws Throws an error when the device does not exist.
     */
    public async getDeviceByID(id: number): Promise<IDevice | null> {
        const device = await this.deviceModel.findOne({ id: id });
        if (!device) {
            throw new Error("Não foi possível encontrar dispositivo com id: " + id);
        }
        return device;
    }

    /**
     * Updates an existing device with new values using `findOneAndUpdate`.
     * Excludes `ip` and `id` from updates.
     * @param {string} ip - The IP address of the device to update.
     * @param {Partial<IDevice>} new_device - The new data to update the device with.
     * @returns {Promise<IDevice | null>} - The updated device, or null if not found.
     */
    public async updateDevice(ip: string, new_device: Partial<IDevice>): Promise<IDevice | null> {
        const { ip: _, id, ...updatableFields } = new_device;

        const updatedDevice = await this.deviceModel.findOneAndUpdate(
            { ip },
            { $set: updatableFields },
            { new: true }
        );

        return updatedDevice;
    }



    /**
     * Removes a device by its ID.
     * @param {number} id - The unique identifier of the device to remove.
     * @returns {Promise<IDevice | null>} The removed device data, or null if not found.
     */
    public async removeDevice(id: number): Promise<IDevice | null> {
        return await this.deviceModel.findOneAndDelete({ id });
    }
    //#endregion

    //#region ============== Task Operations ==============  
    /**
     * Creates a new task in the database.
     * @param {Partial<ITask>} values - The data for the new task.
     * @returns {Promise<number>} The ID of the created task.
     * @throws Will throw an error if task creation fails.
     */
    public async createTask(values: Partial<ITask>): Promise<number> {
        try {
            const lastTask = await this.taskModel.findOne().sort({ id: -1 });
            const newId = lastTask ? lastTask.id + 1 : 1;

            const task = new this.taskModel({
                ...values,
                id: newId,
            });

            await task.save();
            return newId;
        } catch (error) {
            this.logger.error("Erro ao criar tarefa:", error);
            throw new Error("Task creation failed.");
        }
    }

    /**
     * Retrieves a task by its ID.
     * @param {number} id - The unique identifier of the task.
     * @returns {Promise<ITask | null>} The task data, or null if not found.
     */
    public async getTaskByID(id: number): Promise<ITask | null> {
        return await this.taskModel.findOne({ id });
    }

    /**
     * Updates an existing task with new values using `findOneAndUpdate`.
     * @param {number} id - The ID of the task to update.
     * @param {Partial<ITask>} new_task - The new data to update the task with.
     * @returns {Promise<ITask | null>} - The updated task, or null if not found.
     * @throws {Error} If any required fields are missing in `new_task`.
     */
    public async updateTask(id: number, new_task: Partial<ITask>): Promise<ITask | null> {
        if (
            new_task.frequency === undefined ||
            !new_task.device_metrics ||
            !new_task.global_options ||
            !new_task.link_metrics ||
            !new_task.alert_conditions
        ) {
            throw new Error("All fields must be provided to update the task.");
        }

        const updatedTask = await this.taskModel.findOneAndUpdate(
            { id },
            { $set: new_task },
            { new: true }
        );

        return updatedTask;
    }

    /**
     * Removes a task by its ID.
     * @param {number} id - The unique identifier of the task to remove.
     * @returns {Promise<ITask | null>} The removed task data, or null if not found.
     */
    public async removeTask(id: number): Promise<ITask | null> {
        return await this.taskModel.findOneAndDelete({ id });
    }
    //#endregion

    //#region ============== Metrics Operations ==============
    /**
     * Creates a new metrics entry in the database.
     * @param {Partial<IMetrics>} values - The data for the new metrics entry.
     * @returns {Promise<IMetrics>} The created metrics entry.
     * @throws Will throw an error if metrics creation fails.
     */
    public async createMetrics(values: Partial<IMetrics>): Promise<IMetrics> {
        try {
            const metrics = new this.metricsModel(values);
            await metrics.save();
            return metrics;
        } catch (error) {
            this.logger.error("Erro ao criar métricas:", error);
            throw new Error("Metrics creation failed.");
        }
    }

    /**
     * Retrieves a metrics entry by taskID and deviceSessionID.
     * @param {number} taskID - The ID of the task.
     * @param {Buffer} deviceSessionID - The session ID of the device.
     * @returns {Promise<IMetrics | null>} The metrics data, or null if not found.
     */
    public async getMetrics(taskID: number, deviceSessionID: Buffer): Promise<IMetrics | null> {
        return await this.metricsModel.findOne({ taskID, deviceSessionID });
    }

    /**
     * Updates existing metrics for a device using `findOneAndUpdate`.
     * @param {number} taskID - The task ID for which the metrics need to be updated.
     * @param {Buffer} deviceSessionID - The device session ID to update the metrics for.
     * @param {Partial<IMetrics>} new_metrics - The new metrics data to update.
     * @returns {Promise<IMetrics | null>} - The updated metrics, or null if not found.
     * @throws {Error} If the required fields for metrics are missing.
     */
    public async updateMetrics(taskID: number, deviceSessionID: Buffer, new_metrics: Partial<IMetrics>): Promise<IMetrics | null> {
        if (!new_metrics.metrics || !new_metrics.deviceSessionID) {
            throw new Error("All fields must be provided to update the metrics.");
        }

        const updatedMetrics = await this.metricsModel.findOneAndUpdate(
            { taskID, deviceSessionID },
            { $set: new_metrics },
            { new: true }
        );

        return updatedMetrics;
    }

    /**
     * Removes a metrics entry by taskID and deviceSessionID.
     * @param {number} taskID - The ID of the task.
     * @param {Buffer} deviceSessionID - The session ID of the device.
     * @returns {Promise<IMetrics | null>} The removed metrics entry, or null if not found.
     */
    public async removeMetrics(taskID: number, deviceSessionID: Buffer): Promise<IMetrics | null> {
        return await this.metricsModel.findOneAndDelete({ taskID, deviceSessionID });
    }
    //endregion

    /**
     * Drops the database after user confirmation. This action is irreversible and will delete all data.
     *
     * @returns {Promise<void>} - Resolves when the drop operation completes or is canceled.
     *
     * @throws {Error} - Throws an error if the database drop operation fails.
     *
     * @remarks
     * This function prompts the user to confirm the database drop action by typing 'Y'. 
     * If the user confirms, it attempts to drop the database. If an error occurs during 
     * the database drop, the error is logged and rethrown.
     * 
     */
    public async dropDatabase(): Promise<void> {
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
                        throw new Error('Database drop operation failed');
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
