import mongoose from 'mongoose';

const MONGO_URL = 'url ? ou usamo ligação tipo SQL'

const DeviceSchema = new mongoose.Schema({
    id: {type: Number, required: true},
    ip: {type: String, required: true},
    key: {type: Number, required: true, select: false}, //A chave que falamos na aula??
    tasks: [{type: ObjectId}],
    connectAt: { type: Date, required: true}, //Nao sei se é required
});

const DeviceModel = mongoose.model('Device', DeviceSchema);

const getDevices = () => DeviceModel.find();
const getDeviceByID = (id: number) => DeviceModel.findOne({ id })
const getDeviceByIP = (ip: string) => DeviceModel.findOne({ ip })
const getTasksByDevice = (deviceId: mongoose.Types.ObjectId) => DeviceModel.findById(deviceId).populate('tasks');

const removeDevice = (id: number) => DeviceModel.findOneAndDelete({ id });


const TaskSchema = new mongoose.Schema({
    id: {type: Number, required: true},
    frequency: {type: Number, required: true},
    Devices: [{type: ObjectId}],
    metrics: {type: "Esta parte não sei... colocariamos em runTime?"}
})

const TaskModel = mongoose.model('Task', DeviceSchema);

const getTasks = () => TaskModel.find();
const getTaskByID = (id: number) => TaskModel.findOne({ id });
const getDevicesByTask = (taskId: mongoose.Types.ObjectId) => TaskModel.findById(taskId).populate('Devices');

const removeTask = (id: number) => TaskModel.findOneAndDelete({ id });