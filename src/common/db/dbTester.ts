import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { DatabaseDAO } from "./databaseDAO.js";
import { createDevice, deviceToString } from "./interfaces/IDevice.js";
import { createMetrics, metricsToString } from "./interfaces/IMetrics.js";
import { createAlertConditions, createLinkMetrics, createOptions, createTask, IPERF_MODE, taskToString } from "./interfaces/ITask.js";

async function testDeviceOperations(db: DatabaseDAO) {
    const logger = getOrCreateGlobalLogger();

    const newDevice = createDevice(
        "192.168.1.1",
        8080,
        Buffer.from("secret123"),
        Buffer.from("salt456"),
        Buffer.from("session789"),
        new Date()
    );

    const newDevice2 = createDevice(
        "ipdiferente",
        8080,
        Buffer.from("secret123"),
        Buffer.from("salt456"),
        Buffer.from("askndansd"),
        new Date()
    );

    const deviceId = await db.storeDevice(newDevice);
    const deviceId2 = await db.storeDevice(newDevice2);
    logger.log("Device created with ID:", deviceId);
    logger.log("Device created with ID:", deviceId2);

    const deviceByIP = await db.getDeviceByIP("192.168.1.1");
    if (deviceByIP) logger.log("Retrieved Device by IP:", deviceToString(deviceByIP));

    const updatedDevice = await db.updateDevice("192.168.1.1", { port: 9090 });
    if (updatedDevice) logger.log("Updated Device:", deviceToString(updatedDevice));

    //const removedDevice = await db.removeDevice(deviceId);
    //if(removedDevice)logger.log("Removed Device:", deviceToString(removedDevice));
}

async function testTaskOperations(db: DatabaseDAO) {
    const logger = getOrCreateGlobalLogger();

    const newTask = createTask(
        60,
        ["cpu", "memory"],
        createOptions(IPERF_MODE.CLIENT),
        createLinkMetrics(["asdasd", "bandwith", "test"], [createOptions(IPERF_MODE.SERVER), createOptions(undefined), createOptions(undefined, undefined, undefined, undefined, undefined, 42)]),
        createAlertConditions(undefined,undefined,undefined,undefined,undefined,15)
    );
    logger.log("Retrieved Task by ID:", newTask);

    const taskId = await db.storeTask(newTask);
    logger.log("Task created with ID:", taskId);

    const taskByID = await db.getTaskByID(taskId);
    if (taskByID) logger.log("Retrieved Task by ID:", taskToString(taskByID));

    const updatedTask = await db.updateTask(taskId, { frequency: 120 });
    if (updatedTask) logger.log("Updated Task:", taskToString(updatedTask));

    //const removedTask = await db.removeTask(taskId);
    //if(removedTask)logger.log("Removed Task:", taskToString(removedTask));
}

async function testMetricsOperations(db: DatabaseDAO) {
    const logger = getOrCreateGlobalLogger();
    
    logger.log("\n");
    const newMetrics = createMetrics(1, Buffer.from("deviceSession123"), ["cpu", "memory"]);
    const metricsEntry = await db.storeMetrics(newMetrics);
    logger.log("Metrics created!");
    logger.log(metricsToString(metricsEntry));

    const metrics = await db.getMetrics(1, Buffer.from("deviceSession123"));
    logger.log("Recived Metrics!");
    if (metrics) logger.log(metricsToString(metrics));
    
    await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu_usage": {metric: [{ value: 70, timestamp: new Date(), alert: false }] } });
    await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu": {metric: [{ value: 72, timestamp: new Date(), alert: false }] } });
    await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu": {metric: [{ value: 38, timestamp: new Date(), alert: false }] } });
    const metricsWithValues4 = await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu": {metric: [{ value: 95, timestamp: new Date(), alert: true}] } });
    logger.log("Updated metrics!");
    logger.log(metricsToString(metricsWithValues4));

    const removedMetrics = await db.removeMetrics(1, Buffer.from("deviceSession123"));
    logger.log("Removed metrics!");
    if (removedMetrics) logger.log(metricsToString(removedMetrics));
}

async function dbTester() {
    const logger = getOrCreateGlobalLogger();
    
    const db = new DatabaseDAO();
    await db.dropDatabase();

    try {
        logger.log("=== Testing Device Operations ===");
        await testDeviceOperations(db);

        logger.log("=== Testing Task Operations ===");
        await testTaskOperations(db);

        logger.log("=== Testing Metrics Operations ===");
        await testMetricsOperations(db);
    } catch (error) {
        logger.error("Error during tests:", error);
    }
}

export { dbTester };
