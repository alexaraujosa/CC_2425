import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { Document } from "mongoose";

/**
 * Interface representing a Metrics document in the database.
 * Extends the Mongoose Document interface for MongoDB integration.
 */
interface _IMetric {
    [metricName: string]: {
        metric: {
            value: number;
            timestamp: Date;
            alert: boolean;
        }[];
    }
}

type IMetric = _IMetric | {
    interface_stats?: {
        metric: {
            value: Record<string, number>;
            timestamp: Date;
            alert: boolean;
        }[];
    };
}

interface IMetrics extends Document {
    taskID: number;
    deviceID: number;
    metrics: IMetric
}

/**
 * Creates a new metrics object with a specified task ID, device session ID, and list of metric names.
 * 
 * @param {number} taskID - The ID of the task associated with these metrics.
 * @param {number} deviceID - The session ID of the device associated with these metrics.
 * @param {string[]} metricas - An array of metric names to initialize in the metrics map.
 * 
 * @returns {Partial<IMetrics>} A new metrics object with the specified properties and an empty array for each metric.
 */
function createMetrics(
    taskID: number,
    deviceID: number,
    metricas: string[]
): Partial<IMetrics> {
    const metricsMap: IMetric = {};
    
    metricas.forEach(metricName => {
        metricsMap[<keyof IMetric> metricName] = {
            metric: []
        };
    });

    return {
        taskID: taskID,
        deviceID: deviceID,
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
    metrics: IMetric
) {
    const logger = getOrCreateGlobalLogger();
    
    if (typeof metricTable.metrics !== "object" || metricTable.metrics === null) {
        throw new Error("This metric table does not have a valid `metrics` object.");
    }

    for (const [metricName, { valor, timestamp, alert }] of Object.entries(metrics)) {
        if (!(metricName in metricTable.metrics)) {
            logger.error(`Metric '${metricName}' is missing in the metric table.`);
            throw new Error(`Metric table does not contain the metric '${metricName}'.`);
        }

        const metricData = metricTable.metrics[<keyof IMetric>metricName];
        if(!metricData){
            throw new Error(`Metric data is undefined!`);
        }

        if (!Array.isArray(metricData.metric)) {
            throw new Error(`Invalid metric data for '${metricName}'.`);
        }


        metricData.metric.push({
            value: valor,
            timestamp: timestamp,
            alert: alert
        });
    }
}

/**
 * Returns a string with the metrics's values.
 * 
 * @param {IMetrics} metricsObj - The metrics table you want to print the information from. 
 * @returns {string} The idented string with the information from the table.
 */
function metricsToString(metricsObj: IMetrics): string {
    const { taskID, deviceID, metrics } = metricsObj;
    let result = `Task ID: ${taskID}\nDevice ID: ${deviceID}\n`;

    for (const metricName in metrics) {
        if (metricName in metrics) {
            const metricData = metrics[<keyof IMetric>metricName];

            if (metricData && Array.isArray(metricData.metric)) {
                result += `\nMetric: ${metricName}\n`;

                metricData.metric.forEach((metric, index) => {
                    const alertStatus = metric.alert ? "ALERT" : "No Alert";
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
    IMetric,
    IMetrics,
    createMetrics,
    addMetrics,
    metricsToString
};
