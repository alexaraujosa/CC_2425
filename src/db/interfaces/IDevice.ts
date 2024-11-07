import { Document } from 'mongoose';

// Interface para dispositivos
interface IDevice extends Document {
    id: number;
    ip: string;
    port: number;
    auth: {
        public_key: Buffer[];
        private_key: Buffer[];
        salt: Buffer[];
        sessionId: Buffer[];
    };
    tasks: number[];
    connectAt: Date;
}

function createIDevice(
    new_ip: string,
    port: number,
    public_key: Buffer[],
    private_key: Buffer[],
    salt: Buffer[],
    sessionId: Buffer[],
    tasks: number[],
    connectAt: Date
) {
    return {
        ip: new_ip,
        port: port,
        auth: {
            public_key: public_key,
            private_key: private_key,
            salt: salt,
            sessionId: sessionId,
        },
        tasks: tasks,
        connectAt: connectAt,
        
        toString() {
            return `Device [IP: ${this.ip}, Tasks: [${this.tasks.join(', ')}], Connected At: ${this.connectAt.toISOString()}]`;
        }
    };
}

export {
    IDevice,
    createIDevice

}