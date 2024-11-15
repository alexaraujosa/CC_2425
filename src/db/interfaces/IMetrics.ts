import { Document } from "mongoose";

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
    if (typeof metricTable.metrics !== 'object' || metricTable.metrics === null) {
        throw new Error("This metric table does not have a valid `metrics` object.");
    }

    for (const [metricName, { valor, timestamp, alert }] of Object.entries(metrics)) {
        // Verifica se a métrica existe no objeto 'metrics'
        if (!(metricName in metricTable.metrics)) {
            console.error(`Metric '${metricName}' is missing in the metric table.`);
            throw new Error(`Metric table does not contain the metric '${metricName}'.`);
        }

        const metricData = metricTable.metrics[metricName];

        // Verifica se a propriedade 'metric' é um array
        if (!Array.isArray(metricData.metric)) {
            throw new Error(`Invalid metric data for '${metricName}'.`);
        }

        // Adiciona a nova entrada à lista de métricas
        metricData.metric.push({
            value: valor,
            timestamp: timestamp,
            alert: alert
        });
    }
}


function metricsToString(metricsObj: IMetrics): string {
    const { taskID, deviceSessionID, metrics } = metricsObj;
    let result = `Task ID: ${taskID}\nDevice Session ID: ${deviceSessionID.toString('hex')}\n`;

    for (const metricName in metrics) {
        if (metrics.hasOwnProperty(metricName)) {
            const metricData = metrics[metricName];

            if (metricData && Array.isArray(metricData.metric)) {
                result += `\nMetric: ${metricName}\n`;

                metricData.metric.forEach((metric, index) => {
                    const alertStatus = metric.alert ? 'ALERT' : 'No Alert';
                    result += `  Metric ${index + 1} - Value: ${metric.value}, Timestamp: ${metric.timestamp.toISOString()}, Status: ${alertStatus}\n`;
                });
            } else {
                result += `\nMetric: ${metricName} has no valid data.\n`;
            }
        }
    }

    return result;
}






export {   
    IMetrics,
    createMetrics,
    addMetrics,
    metricsToString
};
