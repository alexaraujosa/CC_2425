/**
 * Entry point for the SERVER Solution.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

//import path from "path";
import { TestType } from "$common/index.js";
import isBinMode from "$common/util/isBinMode.js";
//import { readJsonFile } from "$common/util/paths.js";
//import { Config } from "./config.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { createMetrics } from "../db/interfaces/IMetrics.js";
import { DatabaseDAO } from "../db/databaseDAO.js";
import { createDevice } from "../db/interfaces/IDevice.js";
import { createTask } from "../db/interfaces/ITask.js";
DatabaseDAO;createDevice;createTask;






/**
 * Test CRUD operations for Device in the DatabaseDAO.
 * @param {DatabaseDAO} db - Instance of DatabaseDAO to perform operations.
 */
async function testDeviceOperations(db: DatabaseDAO) {
    // Create a device
    const newDevice = createDevice(
        "192.168.1.1",
        8080,
        Buffer.from("secret123"),
        Buffer.from("salt456"),
        Buffer.from("session789"),
        new Date()
    );
    const deviceId = await db.storeDevice(newDevice);
    console.log("Device created with ID:", deviceId);

    // Retrieve device by IP
    const deviceByIP = await db.getDeviceByIP("192.168.1.1");
    console.log("Retrieved Device by IP:", deviceByIP);

    // Update the device
    const updatedDevice = await db.updateDevice("192.168.1.1", { port: 9090 });
    console.log("Updated Device:", updatedDevice);

    // Remove the device
    const removedDevice = await db.removeDevice(deviceId);
    console.log("Removed Device:", removedDevice);
}

/**
 * Test CRUD operations for Task in the DatabaseDAO.
 * @param {DatabaseDAO} db - Instance of DatabaseDAO to perform operations.
 */
async function testTaskOperations(db: DatabaseDAO) {
    // Create a task
    const newTask = createTask(
        60,
        ["cpu", "memory"],
        { },                 // Assuming IOptions has retry configuration
        { }, // Assuming ILinkMetrics config for link metrics
        { }              // Assuming IAlertConditions config for alert conditions
    );
    const taskId = await db.storeTask(newTask);
    console.log("Task created with ID:", taskId);

    // Retrieve task by ID
    const taskByID = await db.getTaskByID(taskId);
    console.log("Retrieved Task by ID:", taskByID);

    // Update the task
    const updatedTask = await db.updateTask(taskId, { frequency: 120 });
    console.log("Updated Task:", updatedTask);

    // Remove the task
    const removedTask = await db.removeTask(taskId);
    console.log("Removed Task:", removedTask);
}

/**
 * Test CRUD operations for Metrics in the DatabaseDAO.
 * @param {DatabaseDAO} db - Instance of DatabaseDAO to perform operations.
 */
async function testMetricsOperations(db: DatabaseDAO) {
    // Create metrics entry
    const newMetrics = createMetrics(
        1,
        Buffer.from("deviceSession123"),
        ["cpu", "memory"]
    );
    const metricsEntry = await db.storeMetrics(newMetrics);
    console.log("Metrics entry created:", metricsEntry.toString());

    // Retrieve metrics by taskID and deviceSessionID
    const metrics = await db.getMetrics(1, Buffer.from("deviceSession123"));
    console.log("Retrieved Metrics:", metrics?.toString());

    // Remove metrics entry
    const removedMetrics = await db.removeMetrics(1, Buffer.from("deviceSession123"));
    console.log("Removed Metrics:", removedMetrics?.toString());
}









/**
 * Example server function with documentaton.
 * 
 * *Also* ~~Supports~~ **Markdown**
 */
export async function serverInit(param1: string, param2: TestType) {
    const logger = getOrCreateGlobalLogger({printCallerFile: true, debug: true});
    logger.info("Hello world from SERVER.");
    
    const db = new DatabaseDAO();
    await db.dropDatabase();

    try {
        console.log("=== Testing Device Operations ===");
        await testDeviceOperations(db);
        console.log("=== Testing Task Operations ===");
        await testTaskOperations(db);
        console.log("=== Testing Metrics Operations ===");
        await testMetricsOperations(db);
    } catch (error) {
        console.error("Error during tests:", error);
    }
}

if (isBinMode(import.meta.url)) {
    serverInit("abc", { prop1: true, prop2: 123, prop3: {} });
}