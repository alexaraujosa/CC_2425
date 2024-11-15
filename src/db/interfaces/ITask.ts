import { Document } from 'mongoose';

/**
 * Enumeration for defining the IPerf operation mode.
 */
enum IPERF_MODE {
    CLIENT = "client",
    SERVER = "server",
}

/**
 * Enumeration for defining the IPerf transport type.
 */
enum IPERF_TRANSPORT {
    TPC = "tcp",
    UDP = "udp"
}


/**
 * Interface representing the configuration options.
 */
interface IOptions {
    mode?: IPERF_MODE,
    target?: string,
    duration?: number,
    transport?: IPERF_TRANSPORT,
    interval?: number,
    counter?: number
}

/**
 * Creates an IOptions instance with the specified configuration settings.
 * 
 * @param {IPERF_MODE} mode - Operation mode (CLIENT or SERVER).
 * @param {string} target - The target for the performance test.
 * @param {number} duration - Duration of the test in seconds.
 * @param {IPERF_TRANSPORT} transport - Transport protocol (TCP or UDP).
 * @param {number} interval - Measurement interval in seconds.
 * @param {number} counter - Sample counter.
 * @returns {IOptions} - An object containing the configured options.
 */
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

/**
 * Interface for a set of link metrics and their associated configuration options.
 */
interface ILinkMetrics {
    [metricName: string]: IOptions,
}

/**
 * Creates a link metrics object, associating each metric name with its corresponding options.
 * 
 * @param {string[]} metricsNames - Names of the metrics.
 * @param {IOptions[]} options - List of corresponding options for each metric.
 * @returns {ILinkMetrics} - An object containing metrics and their associated options.
 * @throws {Error} - Throws an error if the number of metrics and options is not the same.
 */
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

/**
 * Interface for alert conditions based on performance metrics.
 */
interface IAlertConditions {
        cpu_usage?: number,
        ram_usage?: number,
        interface_stats?: number,
        packet_loss?: number,
        jitter?: number,
}

/**
 * Creates an IAlertConditions instance with specified alert condition values.
 * 
 * @param {number} cpu_usage - CPU usage threshold for triggering an alert.
 * @param {number} ram_usage - RAM usage threshold for triggering an alert.
 * @param {number} interface_stats - Network interface statistics.
 * @param {number} packet_loss - Packet loss percentage for triggering an alert.
 * @param {number} jitter - Jitter threshold for triggering an alert.
 * @returns {IAlertConditions} - An object containing the configured alert conditions.
 */
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

/**
 * Interface for a monitoring task and its configuration.
 */
interface ITask extends Document {
    id: number;
    frequency: number;            
    device_metrics: string[];
    global_options: IOptions;
    link_metrics: ILinkMetrics;
    alert_conditions: IAlertConditions
}

/**
 * Creates an ITask instance with the specified parameters.
 * 
 * @param {number} frequency - Frequency of task execution in minutes.
 * @param {string[]} device_metrics - List of device metrics to monitor.
 * @param {IOptions} global_opt - Global configuration options for the task.
 * @param {ILinkMetrics} link_metrics - Associated link metrics with/without options.
 * @param {IAlertConditions} alert_conditions - Configured alert conditions for the task.
 * @returns {ITask} - An object representing the task with its configuration.
 */
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