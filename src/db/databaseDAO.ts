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
import { addMetrics, IMetrics } from './interfaces/IMetrics.js';
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
            this.logger.success(`Connected with mongoDB uing database ${MONGO_URL.slice( MONGO_URL.lastIndexOf('/'), MONGO_URL.length)}`);
        } catch (error) {
            throw new Error('Error connecting to MongoDB:');
        }
    }

    //#region ============== Device Operations ==============
    /**
     * Creates a new device in the database or updates an existing device's connection time if it exists.
     * @param {Partial<IDevice>} values - The data for the new device.
     * @returns {Promise<number>} The ID of the created or updated device, or -1 if creation fails.
     * @throws Throws an error when the device is not stored.
     */
    public async storeDevice(values: Partial<IDevice>): Promise<number> {
        try{
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
        } catch {
            throw Error(`Error storing device with id:${values.ip} in database`);
        }
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
            throw new Error("Error fetching device with ip: " + ip);
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
            throw new Error("Error fetching device with id: " + id);
        }
        return device;
    }

    /**
     * Updates an existing device with new values using `findOneAndUpdate`.
     * Excludes `ip` and `id` from updates.
     * @param {string} ip - The IP address of the device to update.
     * @param {Partial<IDevice>} new_device - The new data to update the device with.
     * @returns {Promise<IDevice | null>} - The updated device, or null if not found.
     * @throws Error when not able to update the device.
     */
    public async updateDevice(ip: string, new_device: Partial<IDevice>): Promise<IDevice | null> {
        try {
            const { ip: _, id, ...updatableFields } = new_device;

            const updatedDevice = await this.deviceModel.findOneAndUpdate(
                { ip },
                { $set: updatableFields },
                { new: true }
            );

            return updatedDevice;
        } catch {
            throw new Error(`Error updating device with ip;${new_device.ip}`);
        }
    }

    /**
     * Removes a device by its ID.
     * @param {number} id - The unique identifier of the device to remove.
     * @returns {Promise<IDevice | null>} The removed device data, or null if not found.
     * @throws Throws an error when removing the devices does not succeed.
     */
    public async removeDevice(id: number): Promise<IDevice | null> {
        try{
            return await this.deviceModel.findOneAndDelete({ id });
        } catch {
            throw new Error(`Error removing device with id:${id}`);
        }
    }
    //#endregion

    //#region ============== Task Operations ==============  
    /**
     * Creates a new task in the database.
     * @param {Partial<ITask>} values - The data for the new task.
     * @returns {Promise<number>} The ID of the created task.
     * @throws Will throw an error if storing the task fails.
     */
    public async storeTask(values: Partial<ITask>): Promise<number> {
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
            throw new Error("Error storing the Task.");
        }
    }

    /**
     * Retrieves a task by its ID.
     * @param {number} id - The unique identifier of the task.
     * @returns {Promise<ITask | null>} The task data, or null if not found.
     * @throws Throws an error if the task does not exists.
     */
    public async getTaskByID(id: number): Promise<ITask | null> {
        const task = await this.taskModel.findOne({ id });
        if(!task){
            throw new Error(`Error fetching task with id:${id}`);
        }
        return task;
    }

    /**
     * Updates an existing task with new values using `findOneAndUpdate`.
     * @param {number} id - The ID of the task to update.
     * @param {Partial<ITask>} new_task - The new data to update the task with.
     * @returns {Promise<ITask | null>} - The updated task, or null if not found.    
     * @throws Error when not able to update the task.
     */
    public async updateTask(id: number, new_task: Partial<ITask>): Promise<ITask | null> {
        try{
            const { id: _, ...updatableFields} = new_task;
            const updatedTask = await this.taskModel.findOneAndUpdate(
                { id },
                { $set: updatableFields },
                { new: true }
            );

            return updatedTask;
        } catch {
            throw new Error(`Error updating task with id:${id}`)
        }
    }

    /**
     * Removes a task by its ID.a
     * @param {number} id - The unique identifier of the task to remove.
     * @returns {Promise<ITask | null>} The removed task data, or null if not found.
     * @throws Throws an error when removing does not succeds.
     */
    public async removeTask(id: number): Promise<ITask | null> {
        try{
            return await this.taskModel.findOneAndDelete({ id });
        } catch {
            throw new Error(`Error removing task with id:${id}`)
        }
    }
    //#endregion

    //#region ============== Metrics Operations ==============
    /**
     * Creates a new metrics entry in the database.
     * @param {Partial<IMetrics>} values - The data for the new metrics entry.
     * @returns {Promise<IMetrics>} The created metrics entry.
     * @throws Will throw an error if metrics creation fails.
     */
    public async storeMetrics(values: Partial<IMetrics>): Promise<IMetrics> {
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
     * @throws Throws an error when fetching the object does not succeds.
     */
    public async getMetrics(taskID: number, deviceSessionID: Buffer): Promise<IMetrics | null> {
        const metrics = await this.metricsModel.findOne({ taskID, deviceSessionID });
        if(!metrics){
            throw new Error(`Error fetching metrics form Device:${deviceSessionID} and Task:${taskID}`);
        }
        return metrics;    
    }

    /**
     * Adds new metrics to an existing metrics entry in the database.
     * @param {number} taskID - The task ID associated with the metrics.
     * @param {Buffer} deviceSessionID - The session ID of the device.
     * @param {Object} newMetrics - The new metrics data to add.
     * @returns {Promise<IMetrics>} The updated metrics entry.
     * @throws Will throw an error if the metrics entry is not found or update fails.
     */
        public async addMetricsToExisting(
            taskID: number,
            deviceSessionID: Buffer,
            newMetrics: { [metricName: string]: { valor: number, timestamp: Date, alert: boolean } }
        ): Promise<IMetrics> {
            try {
                // Retrieve the existing metrics entry
                const existingMetrics = await this.metricsModel.findOne({ taskID, deviceSessionID });
    
                if (!existingMetrics) {
                    throw new Error("Metrics entry not found.");
                }
    
                // Use the existing addMetrics function to update the metrics
                addMetrics(existingMetrics, newMetrics);
    
                // Save the updated metrics entry
                await existingMetrics.save();
                return existingMetrics;
            } catch (error) {
                this.logger.error("Erro ao adicionar métricas:", error);
                throw new Error("Failed to add metrics.");
            }
        }

    /**
     * Removes a metrics entry by taskID and deviceSessionID.
     * @param {number} taskID - The ID of the task.
     * @param {Buffer} deviceSessionID - The session ID of the device.
     * @returns {Promise<IMetrics | null>} The removed metrics entry, or null if not found.
     * @throws Throws error when removing metrics does not succeds.
     */
    public async removeMetrics(taskID: number, deviceSessionID: Buffer): Promise<IMetrics | null> {
        try{
            return await this.metricsModel.findOneAndDelete({ taskID, deviceSessionID });
        } catch {
            throw new Error("Error removing Metrics entry");
        }
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
