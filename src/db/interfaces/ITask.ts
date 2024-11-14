import { Document } from 'mongoose';

enum IPERF_MODE {
    CLIENT = "client",
    SERVER = "server",
}

enum IPERF_TRANSPORT {
    TPC = "tcp",
    UDP = "udp"
}

interface IOptions {
    mode?: IPERF_MODE,
    target?: string,
    duration?: number,
    transport?: IPERF_TRANSPORT,
    interval?: number,
    counter?: number
}

function createOptions(mode?: IPERF_MODE, target?: string, duration?: number, transport?: IPERF_TRANSPORT, interval?: number, counter?: number){
    return{
        mode: mode,
        target: target,
        duration: duration,
        transport: transport,
        interval: interval,
        counter: counter,

        toString(){
            return `Options: mode:${mode};target:${target};duration:${duration};transport:${transport};interval:${interval};counter:${counter}`;
        }
    }
}

interface ILinkMetrics {
    [metricName: string]: IOptions,
}

function createLinkMetrics(metricsNames: string[], options: IOptions[]) {
    const link_metrics: { [metricName: string]: IOptions } = {}; 

    if (metricsNames.length !== options.length) {
        throw new Error("The number of metrics and options must be the same.");
    }

    metricsNames.forEach((metricName, index) => {
        link_metrics[metricName] = options[index];
    });


    return{
        link_metrics,

        toString() {
            let result = "Metrics Options:\n";
            for (const [metricName, option] of Object.entries(this.link_metrics)) {
                result += `  ${metricName}: mode:${option.mode}; target:${option.target}; duration:${option.duration}; transport:${option.transport}; interval:${option.interval}; counter:${option.counter}\n`;
            }
            return result;
        }
    }
}

interface IAlertConditions {
        cpu_usage?: number,
        ram_usage?: number,
        interface_stats?: number,
        packet_loss?: number,
        jitter?: number,
}

function createAlertConditions(cpu_usage?: number, ram_usage?: number, interface_stats?: number, packet_loss?: number, jitter?: number){
    return{
        cpu_usage: cpu_usage,
        ram_usage: ram_usage,
        interface_stats: interface_stats,
        packet_loss: packet_loss,
        jitter: jitter,

        toString(){
            return `AlertConditions: cpu_usage:${cpu_usage};ram_usage:${ram_usage};interface_stats:${interface_stats};packet_loss:${packet_loss};jitter:${jitter}`;
        }
    }
}

// Interface para tarefas
interface ITask extends Document {
    id: number;
    frequency: number;             // Frequência da task em minutos
    device_metrics: string[];
    global_options: IOptions;
    link_metrics: ILinkMetrics;
    alert_conditions: IAlertConditions
}

function createTask(
    frequency: number,
    device_metrics: string[],
    global_opt: IOptions, 
    link_metrics: ILinkMetrics,
    alert_contditions: IAlertConditions
){
    return {
        frequency: frequency,
        device_metrics: device_metrics,
        global_options: global_opt,
        link_metrics: link_metrics,
        alert_conditions: alert_contditions,

        toString() {
            return `Task Details:
          Frequency: ${this.frequency} minutes
          Device Metrics: ${this.device_metrics.join(", ")}
          ${this.global_options.toString()}
          ${this.link_metrics.toString()}
          ${this.alert_conditions.toString()}`;
        }              
    }
}

export {
    IPERF_MODE,
    IPERF_TRANSPORT,
    IOptions,
    createOptions,
    ILinkMetrics,
    createLinkMetrics,
    IAlertConditions,
    createAlertConditions,
    ITask,
    createTask
}