import { Document } from 'mongoose';

/**
 * Interface representing a Metrics document in the database.
 * Extends the Mongoose Document interface for MongoDB integration.
 */
interface IMetrics extends Document {
    taskID: number;
    deviceSessionID: Buffer;
    metrics: {
        [metricName: string]: {
            metric: { value: number, timestamp: Date, alert: boolean }[];
        };
    };
}

/**
 * Creates a new metrics object with a specified task ID, device session ID, and list of metric names.
 * 
 * @param {number} taskID - The ID of the task associated with these metrics.
 * @param {Buffer} deviceID - The session ID of the device associated with these metrics.
 * @param {string[]} metricas - An array of metric names to initialize in the metrics map.
 * 
 * @returns {Partial<IMetrics>} A new metrics object with the specified properties and an empty array for each metric.
 */
function createMetrics(
    taskID: number,
    deviceSessionID: Buffer,
    metricas: string[]
) {
    const metricsMap: { [metricName: string]: { metric: { value: number, timestamp: Date, alert: boolean }[] } } = {};
    
    metricas.forEach(metricName => {
        metricsMap[metricName] = {
            metric: []
        };
    });

    return {
        taskID: taskID,
        deviceSessionID: deviceSessionID,
        metrics: metricsMap,

        toString() {
            let result = `TaskID: ${this.taskID}, DeviceID: ${this.deviceSessionID}\n`;

            for (const [metricName, data] of Object.entries(this.metrics)) {
                result += `\nMétrica: ${metricName}\n`;
                data.metric.forEach(({ value, timestamp, alert }, index) => {
                    result += `  Entrada ${index + 1}:\n`;
                    result += `    Valor: ${value}\n`;
                    result += `    Timestamp: ${timestamp}\n`;
                    result += `    Alerta: ${alert}\n`;
                });
            }

            return result;
        }
    };
}

/**
 * Adds new metric entries to an existing metric table.
 * 
 * @param {Partial<IMetrics>} metricTable - The metrics table to which new metric data will be added.
 * @param {Object} metrics - An object containing metric names as keys and their corresponding values, timestamps, and alerts.
 * 
 * @throws {Error} If `metricTable` is missing the `metrics` property or if a metric name does not exist in the table.
 */
function addMetrics(
    metricTable: Partial<IMetrics>, 
    metrics: { [metricName: string]: { valor: number, timestamp: Date, alert: boolean } }
) {
    for (const [metricName, { valor, timestamp, alert }] of Object.entries(metrics)) {
        if (!metricTable.metrics) {
            throw new Error("This metric table does not have a table for metrics... WEIRD!");
        }

        if (!metricTable.metrics[metricName]) {
            throw new Error("This metric table does not have one of the metrics you are adding!");
        }

        metricTable.metrics[metricName].metric.push({
            value: valor,
            timestamp: timestamp,
            alert: alert
        });
    }
    return;
}

export {
    IMetrics,
    createMetrics,
    addMetrics
};
