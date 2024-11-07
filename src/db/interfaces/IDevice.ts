import { Document } from 'mongoose';

// Interface para dispositivos
interface IDevice extends Document {
    id: number;
    ip: string;
    auth: {
        public_key: number;
        private_key: number;
        salt: string;
    };
    tasks: number[];
    connectAt: Date;
}

function createIDevice(
    new_ip: string, 
    public_key: number,
    private_key: number,
    salt: string,
    tasks: number[],
    connectAt: Date
) {
    return {
        ip: new_ip,
        auth: {
            public_key: public_key,
            private_key: private_key,
            salt: salt
        },
        tasks: tasks,
        connectAt: connectAt,
        
        // Adding toString method for better readability
        toString() {
            return `Device [IP: ${this.ip}, Public Key: ${this.auth.public_key}, Tasks: [${this.tasks.join(', ')}], Connected At: ${this.connectAt.toISOString()}]`;
        }
    };
}

export {
    IDevice,
    createIDevice

}