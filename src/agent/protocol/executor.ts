/**
 * @module EXECUTOR
 * Task executor for the agent solution.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { execSync } from "child_process";

// TODO: Needs to verify alert condition? Or returns the latency value and the agent verifies?
function executePing (target: string, counter: number, interval: number): void {
    const logger = getOrCreateGlobalLogger();
    const ping = execSync(`ping ${target} -c ${counter} -i ${interval} | tail -n 1 | cut -d "/" -f5`);
    logger.info("Latency: " + ping.toString());
}

// TODO: Remains cut the output. We should discuss the strategy to use here, related to the interval.
function executeIPerfServer (duration: number, transport: string, interval: number) {
    const logger = getOrCreateGlobalLogger();
    // TODO: Validate if the port is not occupied. Sometimes it cant start the server because the address is in use.
    const iperf = execSync(`iperf -s -t ${duration} ${transport === "udp" ? "-u" : ""} -i ${interval} -p 12121`); 
    
    
    // NOTE: Iperf only can give jitter and packet loss metrics when using an udp server. The bandwith works on both tcp/udp.
    logger.info(iperf.toString());                      
}

// TODO: executeIPerfClient

export { executePing, executeIPerfServer };