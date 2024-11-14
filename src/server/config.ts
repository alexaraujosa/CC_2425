interface DeviceMetrics {
    cpu_usage: boolean,
    ram_usage: boolean,
    interface_stats: boolean,
    volume: boolean
}

interface GlobalOptions {
    mode: string,
    target: string,
    duration: string,
    transport: string,
    interval: string,
    counter: number
}

interface LinkMetrics {
    bandwith: Bandwith,
    jitter: Jitter,
    packet_loss: Packet_loss,
    latency: Latency
}

interface IperfMetrics {
    mode: string,
    target: string,
    duration: string,
    transport: string,
    interval: string
}

interface Bandwith extends IperfMetrics {}
interface Jitter extends IperfMetrics {}
interface Packet_loss extends IperfMetrics {}
interface Latency {
    target: string,
    counter: number,
    interval: string
}

interface AlertConditions {
    cpu_usage: number,
    ram_usage: number,
    interface_stats: number,
    packet_loss: number,
    jitter: string
}

interface Device {
    ip: string,
    tasks: String[]
}

interface Task {
    id: string,
    frequency: string,
    device_metrics: DeviceMetrics,
    global_options: GlobalOptions,
    link_metrics: LinkMetrics,
    alert_conditions: AlertConditions
}

interface Config {
    tasks: Task[],
    devices: Device[]
}

export type { Config, Task, Device };