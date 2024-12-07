import { exec } from "child_process";
import { getOrCreateGlobalLogger } from "./logger.js";
import { IgnoreValues } from "$common/datagram/spack.js";

/**
 * Performs a network ping to a specified target using the shell command ping.
 * The output is parsed using tail and cut commands.
 * The exec is wrapped in a Promise, which permits the asynchronous execution.
 * 
 * @param target The IP address to ping
 * @param counter The number of ping packets to send
 * @param interval The interval (in seconds) between each packet
 * @param frequency The timeout duration (in seconds) for the ping command to complete
 * @returns The average latency.
 */
async function executePing(
    target: string, 
    counter: number, 
    interval: number, 
    frequency: number
): Promise<number> {
    const logger = getOrCreateGlobalLogger();

    return new Promise((resolve, _) => {
        exec(`ping ${target} -c ${counter} -i ${interval} -w ${frequency} | tail -n 1 | cut -d "/" -f5`, (error, stdout, _) => {
            if (error) {
                logger.warn("Target unreachable.");
                resolve(IgnoreValues.s16);
                return;
            }

            const result:number = parseInt(stdout.trim());
            logger.info("Ping : " + result);

            if (result === 0) {
                logger.warn("Target unreachable.");
                resolve(IgnoreValues.s16);
                return;
            }
            
            resolve(result);
        });
    });
}

/**
 * Runs an iperf command in client mode to measure network metrics such as bandwidth, jitter or packet loss
 * when connecting to a target server. 
 * The output is parsed using tail command and the tool format flag.
 * The exec is wrapped in a Promise, which permits the asynchronous execution.
 * The function has been created for the version 2.0.13 of iperf command. 
 * 
 * @param target The server to which the iperf client will connect
 * @param duration The duration (in seconds) for which the test will run
 * @param transport The transport protocol, either tcp or udp
 * @param interval Interval (in seconds) for intermediate reporting
 * @param metric The network metric to extract
 * @returns Value of the desired metric
 */
async function executeIPerfClient(
    target: string,
    duration: number,
    transport: string,
    interval: number,
    metric: string
): Promise<number> {
    const logger = getOrCreateGlobalLogger();

    return new Promise((resolve, _) => {
        exec(
            `iperf -c ${target} -t ${duration} ${transport === "udp" ? "-u" : ""} -i ${interval} --format m | tail -n 1`,
            (_, stdout) => {
                const stdoutParts = stdout.trim().split(/\s+/);

                if (stdoutParts.length < 9) {
                    logger.warn("Target unreachable.");
                    resolve(IgnoreValues.s16); 
                    return;
                }

                let result: number | null = null;
                if (metric === "bandwidth") result = Math.round(parseInt(stdoutParts[7]));
                else if (metric === "jitter") result = Math.round(parseInt(stdoutParts[9]));
                else if (metric === "packet_loss") result = Math.round(parseInt(stdoutParts[13].replace("%", "").replace("(", "").replace(")", "")));

                if (result === null || isNaN(result)) {
                    logger.warn(`Couldn't parse metric: '${metric}'`);
                    resolve(IgnoreValues.s16);
                    return;
                }

                resolve(result);
            }
        );
    });
}

/**
 * Runs an iperf command in server mode to measure network metrics such as bandwidth, jitter or packet loss
 * based on incoming client connections.
 * The output is parsed using tail command and the tool format flag.
 * The exec is wrapped in a Promise, which permits the asynchronous execution.
 * The function has been created for the version 2.0.13 of iperf command. 
 * 
 * @param duration The duration (in seconds) for which the server should listen
 * @param transport The transport protocol, either tcp or udp
 * @param interval Interval (in seconds) for periodic report
 * @param metric The network metric to extract
 * @returns Value of the desired metric
 */
async function executeIPerfServer(
    duration: number,
    transport: string,
    interval: number, 
    metric: string
): Promise<number> {
    const logger = getOrCreateGlobalLogger();

    return new Promise((resolve, _) => {
        exec(
            `timeout ${duration} iperf -s ${transport === "udp" ? "-u" : ""} -i ${interval} --format m | tail -n 1`,
            (_, stdout) => {

                const stdoutParts = stdout.trim().split(/\s+/);
                if (stdoutParts.length < 9) {
                    logger.warn(`No client connections received.`);
                    resolve(IgnoreValues.s16);
                    return;
                }

                let result: number | null = null;
                if (metric === "bandwidth") result = Math.round(parseInt(stdoutParts[7]));
                else if (metric === "jitter") result = Math.round(parseInt(stdoutParts[9]));
                else if (metric === "packet_loss") result = Math.round(parseInt(stdoutParts[13].replace("%", "").replace("(", "").replace(")", "")));

                if (result === null || isNaN(result)) {
                    logger.warn(`Couldn't parse metric: '${metric}'`);
                    resolve(IgnoreValues.s16);
                    return;
                }

                resolve(result);
            }
        );
    });
}

export { executePing, executeIPerfClient, executeIPerfServer };