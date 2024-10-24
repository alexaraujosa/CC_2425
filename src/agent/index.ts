/**
 * Entry point for the AGENT Solution.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import isBinMode from "$common/util/isBinMode.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import net from "net";

const HOST = "127.0.0.1";
const PORT = "2022";

/**
 * Example agent function with documentaton.
 * 
 * *Also* ~~Supports~~ **Markdown**
 */
export function agentInit() {
    const logger = getOrCreateGlobalLogger({printCallerFile: true, debug: true});
    logger.log("Hello world from AGENT.");

    const client = net.connect({port: Number(PORT), host: HOST}, () => {
        logger.log("Connected to " + HOST + ":" + PORT);
        client.write("Hello server! I'm an agent.");

        client.on("data", data => {
            logger.log("Received data: " + data);
        });

        client.on("error", error => {
            logger.log(error);
        });

        client.on("close", () => {
            logger.log("Connection closed.");
        });
    });

}

if (isBinMode(import.meta.url)) {
    agentInit();
}