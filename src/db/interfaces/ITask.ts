import { Document } from 'mongoose';

// Interface para tarefas
export interface ITask extends Document {
    id: number;
    frequency: number;             // Frequência da task em minutos
    devices: number[];             // Lista de IDs de dispositivos
    metrics: {
        [deviceId: number]: {      // Mapeamento de ID do dispositivo para suas métricas
            [metricName: string]: {
                values: number[];
                timestamps: string[];
            }
        }
    };
}
