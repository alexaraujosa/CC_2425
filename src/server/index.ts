/**
 * Entry point for the SERVER Solution.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import path from "path";
import { TestType } from "$common/index.js";
import isBinMode from "$common/util/isBinMode.js";
import { readJsonFile } from "$common/util/paths.js";
import { Config } from "./config.js";
import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { DatabaseDAO } from "../db/databaseDAO.js";
import { createDevice } from "../db/interfaces/IDevice.js";
import { createTask } from "../db/interfaces/ITask.js";
import { dbTester } from "src/db/dbTester.js";
DatabaseDAO;createDevice;createTask;

/**
 * Example server function with documentaton.
 * 
 * *Also* ~~Supports~~ **Markdown**
 */
export async function serverInit(param1: string, param2: TestType) {
    const logger = getOrCreateGlobalLogger({printCallerFile: true, debug: true});
    logger.info("Hello world from SERVER.");

    const json = await readJsonFile<Config>(path.join(process.cwd(), "/tmp/settings.json"));
    logger.info(json);

    
    await dbTester();
}

if (isBinMode(import.meta.url)) {
    serverInit("abc", { prop1: true, prop2: 123, prop3: {} });
}