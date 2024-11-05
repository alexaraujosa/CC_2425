import { Document } from 'mongoose';

// Interface para dispositivos
export interface IDevice extends Document {
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