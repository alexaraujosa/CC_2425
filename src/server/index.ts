/**
 * Entry point for the SERVER Solution.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import path from "path";
import net  from "net";
import { TestType } from "$common/index.js";
import isBinMode from "$common/util/isBinMode.js";
import { readJsonFile } from "$common/util/paths.js";
import { Config } from "./config.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";

const HOST = "127.0.0.1";
const PORT = "2022";

/**
 * Example server function with documentaton.
 * 
 * *Also* ~~Supports~~ **Markdown**
 */
export async function serverInit(param1: string, param2: TestType) {
    const logger = getOrCreateGlobalLogger({printCallerFile: true, debug: false});
    logger.info("Hello world from SERVER.");

    // Config loader
    const json = await readJsonFile<Config>(path.join(process.cwd(), "/tmp/settings.json"));
    logger.info(json);

    // Server setup
    const server = net.createServer();
    
    server.on("connection", socket => {
        console.log("Agent connected.");
        socket.write("Hello agent, I'm the server.");
        socket.write("See you on the other side.");
        socket.end();

        socket.on("data", data => {
            console.log("Received data: " + data);
        });

        socket.on("error", error => {
            console.log(error);
            server.close();
        })

        socket.on("close", () => {
            console.log("Agent disconnected.")
        });
        
    });

    server.listen({port: PORT, host: HOST}, () => console.log("Server bound to port " + PORT + " with success."));  
}

if (isBinMode(import.meta.url)) {
    serverInit("abc", { prop1: true, prop2: 123, prop3: {} });
}