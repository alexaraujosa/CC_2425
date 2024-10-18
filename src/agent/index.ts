/**
 * Entry point for the AGENT Solution.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { TestType } from "$common/index.js";
import net from 'net';

const HOST = "127.0.0.1";
const PORT = "2022";

/**
 * Example agent function with documentaton.
 * 
 * *Also* ~~Supports~~ **Markdown**
 */
export function agentInit(param1: string, param2: TestType) {
    console.log("Hello world from AGENT.");

    const client = net.connect({port: Number(PORT), host: HOST}, () => {
        console.log("Connected to " + HOST + ":" + PORT);
        client.write("Hello server! I'm an agent.");

        client.on("data", data => {
            console.log("Received data: " + data);
        })

        client.on("error", error => {
            console.log(error);
        })

        client.on("close", () => {
            console.log("Connection closed.");
        })
    });

}

agentInit("def", { prop1: false, prop2: 987, prop3: { prop1: true } });