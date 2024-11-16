import { DatabaseDAO } from "./databaseDAO.js";
import { createDevice, deviceToString } from "./interfaces/IDevice.js";
import { createMetrics, metricsToString } from "./interfaces/IMetrics.js";
import { createAlertConditions, createLinkMetrics, createOptions, createTask, IPERF_MODE, taskToString } from "./interfaces/ITask.js";

async function testDeviceOperations(db: DatabaseDAO) {
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

    const deviceByIP = await db.getDeviceByIP("192.168.1.1");
    if(deviceByIP)console.log("Retrieved Device by IP:", deviceToString(deviceByIP));

    const updatedDevice = await db.updateDevice("192.168.1.1", { port: 9090 });
    if(updatedDevice)console.log("Updated Device:", deviceToString(updatedDevice));

    const removedDevice = await db.removeDevice(deviceId);
    if(removedDevice)console.log("Removed Device:", deviceToString(removedDevice));
}

async function testTaskOperations(db: DatabaseDAO) {
    const newTask = createTask(
        60,
        ["cpu", "memory"],
        createOptions(IPERF_MODE.CLIENT),
        createLinkMetrics(["bandwith", "test"], [createOptions(), createOptions(undefined, undefined, undefined, undefined, undefined, 42)]),
        createAlertConditions(undefined,undefined,undefined,undefined,undefined,15)
    );
    console.log("Retrieved Task by ID:", newTask);

    const taskId = await db.storeTask(newTask);
    console.log("Task created with ID:", taskId);

    const taskByID = await db.getTaskByID(taskId);
    if(taskByID)console.log("Retrieved Task by ID:", taskToString(taskByID));

    const updatedTask = await db.updateTask(taskId, { frequency: 120 });
    if(updatedTask)console.log("Updated Task:", taskToString(updatedTask));

    //const removedTask = await db.removeTask(taskId);
    //if(removedTask)console.log("Removed Task:", taskToString(removedTask));
}

async function testMetricsOperations(db: DatabaseDAO) {
    console.log("\n")
    const newMetrics = createMetrics(1, Buffer.from("deviceSession123"), ["cpu", "memory"]);
    const metricsEntry = await db.storeMetrics(newMetrics);
    console.log("Metrics created!");
    console.log(metricsToString(metricsEntry));

    const metrics = await db.getMetrics(1, Buffer.from("deviceSession123"));
    console.log("Recived Metrics!");
    if(metrics)console.log(metricsToString(metrics));
    
    await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu": { valor: 70, timestamp: new Date(), alert: false } })
    await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu": { valor: 72, timestamp: new Date(), alert: false } })
    await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu": { valor: 38, timestamp: new Date(), alert: false } })
    const metricsWithValues4 = await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu": { valor: 95, timestamp: new Date(), alert: true } })
    console.log("Updated metrics!");
    console.log(metricsToString(metricsWithValues4));

    const removedMetrics = await db.removeMetrics(1, Buffer.from("deviceSession123"));
    console.log("Removed metrics!");
    if(removedMetrics)console.log(metricsToString(removedMetrics));
}

async function dbTester() {
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

export { dbTester };
