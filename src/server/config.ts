interface Iperf {
    mode: string,
    server_address: string,
    duration: string,
    transport: string,
    frequency: string
}

interface Device {
    device_id: string,
    device_metrics: {
        cpu_usage: boolean,
        ram_usage: boolean,
        interface_stats: string[]
    }
    link_metrics: {
        bandwidth: {
            iperf: Iperf
        },
        jitter: {
            iperf: Iperf
        },
        packet_loss: {
            iperf: Iperf
        },
        latency: {
            ping: {
                destination: string,
                packet_count: number,
                frequency: string
            }
        },
        alertflow_conditions: {
            cpu_usage: {
                threshold: string
            },
            ram_usage: {
                threshold: string
            },
            interface_stats: {
                threshold_pps: number
            },
            packet_loss: {
                threshold_percentage: string
            },
            jitter: {
                threshold_ms: number
            }
        }
    }
}

interface Task {
    task_id: string,
    frequency: string | number,
    devices: Device[]
}

interface Config {
    tasks: Task[]
}

export type { Config, Task, Device, Iperf };