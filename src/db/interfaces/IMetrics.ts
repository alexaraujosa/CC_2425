import { Document } from 'mongoose';

// Interface da tabela de métricas
interface IMetrics extends Document {
    taskID: number;
    deviceSessionID: Buffer;
    metrics: {
        [metricName: string]: {
            metric: { value: number, timestamp: Date, alert: boolean }[];
        };
    };
}

// Função que cria um objeto Metrics com a nova estrutura
function createMetrics(
    taskID: number,
    deviceID: Buffer,
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
        deviceID: deviceID,
        metrics: metricsMap,

        toString() {
            let result = `TaskID: ${this.taskID}, DeviceID: ${this.deviceID}\n`;

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

// Função para adicionar métricas à estrutura `metricTable` de acordo com a nova interface
function addMetrics(
    metricTable: Partial<IMetrics>, 
    metrics: { [metricName: string]: { valor: number, timestamp: Date, alert: boolean } }
) {
    for (const [metricName, { valor, timestamp, alert }] of Object.entries(metrics)) {
        if (!metricTable.metrics) {
            throw new Error("This metric table does not have a table for metrics... WEIRD!");
            //metricTable.metrics = {};
        }

        if (!metricTable.metrics[metricName]) {
            throw new Error("This metric table does not have one of the metrics you are adding!");
            //metricTable.metrics[metricName] = { metric: [] };
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
