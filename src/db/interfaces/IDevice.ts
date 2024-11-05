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

function CreateIDevice(
    new_ip: string, 
    public_key: number,
    private_key: number,
    salt: string,
    tasks: number[],
    connectAt: Date
){
    return {
        ip: new_ip,
        auth:{
            public_key: public_key,
            private_key: private_key,
            salt: salt
        },
        tasks: tasks,
        connectAt: connectAt
    }
}

export {
    IDevice,
    CreateIDevice
}