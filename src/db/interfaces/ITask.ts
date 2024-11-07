import { Document } from 'mongoose';

// Interface para tarefas
interface ITask extends Document {
    id: number;
    frequency: number;             // Frequência da task em minutos
    metrics: {
        [deviceId: number]: {      // Mapeamento de ID do dispositivo para suas métricas
            [metricName: string]: {
                values: number[];
                timestamps: string[];
            }
        }
    };
}

function createITask(
    frequency: number,
    devices: number[],
    metrics: string[]
){
    const metricsMap: { [deviceId: number]: { [metricName: string]: { values: number[], timestamps: string[] } } } = {};
    
    devices.forEach(deviceId => {
        metricsMap[deviceId] = {}; // Initialize device entry

        metrics.forEach(metricName => {
            metricsMap[deviceId][metricName] = {
                values: [],        // Empty array for values
                timestamps: []     // Empty array for timestamps
            };
        });
    });
    return {
        frequency: frequency,
        metrics: metricsMap
    }
}

export {
    ITask,
    createITask
}