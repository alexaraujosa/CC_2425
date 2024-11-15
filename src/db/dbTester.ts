import { DatabaseDAO } from "./databaseDAO.js";
import { createDevice } from "./interfaces/IDevice.js";
import { createMetrics } from "./interfaces/IMetrics.js";
import { createTask } from "./interfaces/ITask.js";

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
    console.log("Retrieved Device by IP:", deviceByIP);

    const updatedDevice = await db.updateDevice("192.168.1.1", { port: 9090 });
    console.log("Updated Device:", updatedDevice);

    const removedDevice = await db.removeDevice(deviceId);
    console.log("Removed Device:", removedDevice);
}

async function testTaskOperations(db: DatabaseDAO) {
    const newTask = createTask(
        60,
        ["cpu", "memory"],
        {},
        {},
        {}
    );
    const taskId = await db.storeTask(newTask);
    console.log("Task created with ID:", taskId);

    const taskByID = await db.getTaskByID(taskId);
    console.log("Retrieved Task by ID:", taskByID);

    const updatedTask = await db.updateTask(taskId, { frequency: 120 });
    console.log("Updated Task:", updatedTask);

    const removedTask = await db.removeTask(taskId);
    console.log("Removed Task:", removedTask);
}

async function testMetricsOperations(db: DatabaseDAO) {
    const newMetrics = createMetrics(1, Buffer.from("deviceSession123"), ["cpu", "memory"]);
    const metricsEntry = await db.storeMetrics(newMetrics);
    console.log("Metrics entry created:", metricsEntry.toString());

    const metrics = await db.getMetrics(1, Buffer.from("deviceSession123"));
    console.log("Retrieved Metrics:", metrics?.toString());

    const metricsWithValues1 = await db.addMetricsToExisting(1, Buffer.from("deviceSession123"), { "cpu": { valor: 70, timestamp: new Date(), alert: false }, "test": { valor: 70, timestamp: new Date(), alert: false } })
    metricsWithValues1.toString();

    const removedMetrics = await db.removeMetrics(1, Buffer.from("deviceSession123"));
    console.log("Removed Metrics:", removedMetrics?.toString());
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
