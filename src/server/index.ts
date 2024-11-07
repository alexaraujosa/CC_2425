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
import { createIDevice } from "../db/interfaces/IDevice.js";
import { createITask } from "../db/interfaces/ITask.js";

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

    //Convem que isto seja um SINGLETON, Perguntar ao rafa como?
    const dbHandler = new DatabaseDAO();

    // Dados do novo dispositivo
    const newDeviceData1 = createIDevice("192.168.1.10", 12345, 67890, "random_salt", [], new Date());
    const newDeviceData2 = createIDevice("192.168.1.10", 69, 841848, "random_saltino", [], new Date());
    const newDeviceData3 = createIDevice("192.168.125", 69, 841848, "random_saltino", [], new Date());
    
    // TODO: Continuar a criar as tasks e alterar as funções que adicionam as metricas.
    // TODO: Adicionar Porta ao Device.

    try {
        const removeResult1 = await dbHandler.removeDevice(1); // Use await
        const removeResult2 = await dbHandler.removeDevice(2); // Use await
        const removeResult3 = await dbHandler.removeDevice(3); // Use await
        if (removeResult1 && removeResult2 && removeResult3) {
            logger.success("Devices removidos com sucesso.");
        } else {
            logger.warn("Pelo menos um dos devices não foi encontrado para remover.");
        }
    } catch (error) {
        logger.error("Erro ao remover os devices:", error);
    }

    try {
        const newDeviceId = await dbHandler.createDevice(newDeviceData1);
        if (newDeviceId !== -1) {
            console.log(`Dispositivo criado com sucesso. ID: ${newDeviceId}`);
        } else {
            console.error("Falha ao criar dispositivo.");
        }
    } catch (error) {
        logger.error("Erro ao criar o dispositivo:", error);
    }

    try {
        const newDeviceId = await dbHandler.createDevice(newDeviceData2);
        if (newDeviceId !== -1) {
            console.log(`Dispositivo criado com sucesso. ID: ${newDeviceId}`);
        } else {
            console.error("Falha ao criar dispositivo.");
        }
    } catch (error) {
        logger.error("Erro ao criar o dispositivo:", error);
    }

    try {
        const newDeviceId = await dbHandler.createDevice(newDeviceData3);
        if (newDeviceId !== -1) {
            console.log(`Dispositivo criado com sucesso. ID: ${newDeviceId}`);
        } else {
            console.error("Falha ao criar dispositivo.");
        }
    } catch (error) {
        logger.error("Erro ao criar o dispositivo:", error);
    }

    dbHandler.printDevices();






    const task1 = createITask(10, [1,2], ["Bandwith", "jitter"]);
    const task2 = createITask(22, [1], ["Bandwith", "Delay"]);
    const task3 = createITask(11, [], ["Bandwith", "Delay"]);
    const task4 = createITask(32, [3], ["Bandwith", "Delay"]);
    task1;task2;task3;task4;

    try {
        const newDeviceId = await dbHandler.createTask(task1);
        if (newDeviceId !== -1) {
            console.log(`Task criada com sucesso. ID: ${newDeviceId}`);
        } else {
            console.error("Falha ao criar Task.");
        }
    } catch (error) {
        logger.error("Erro ao criar o Task:", error);
    }

    try {
        const newDeviceId = await dbHandler.createTask(task2);
        if (newDeviceId !== -1) {
            console.log(`Task criada com sucesso. ID: ${newDeviceId}`);
        } else {
            console.error("Falha ao criar Task.");
        }
    } catch (error) {
        logger.error("Erro ao criar o Task:", error);
    }

    try {
        const newDeviceId = await dbHandler.createTask(task3);
        if (newDeviceId !== -1) {
            console.log(`Task criada com sucesso. ID: ${newDeviceId}`);
        } else {
            console.error("Falha ao criar Task.");
        }
    } catch (error) {
        logger.error("Erro ao criar o Task:", error);
    }

    try {
        const newDeviceId = await dbHandler.createTask(task4);
        if (newDeviceId !== -1) {
            console.log(`Task criada com sucesso. ID: ${newDeviceId}`);
        } else {
            console.error("Falha ao criar Task.");
        }
    } catch (error) {
        logger.error("Erro ao criar o Task:", error);
    }
    
    logger.log("---------- Lista de Devices ----------");
    await dbHandler.printTasks();
    logger.log("--------------------------------------");

    //provavelmente vou ter de adicionar o criar metric para ser mais simples, recebe string[] e number[]
    await dbHandler.addMetrics(1,1,{"Bandwith": 20})
    await dbHandler.addMetrics(1,1,{"Bandwith": 42})
    await dbHandler.addMetrics(1,1,{"Bandwith": 43})

    await dbHandler.addMetrics(1,2,{"test": 40})
    await dbHandler.addMetrics(1,2,{"jitter": 40})

    logger.log("---------- Print de metricas Task1 e Device1 ----------");
    await dbHandler.printDeviceTaskMetrics(1,1);
    logger.log("-------------------------------------------------------");
    logger.log("---------- Print de metricas Task1 e Device2 ----------");
    await dbHandler.printDeviceTaskMetrics(1,2);
    logger.log("-------------------------------------------------------");
    
}

if (isBinMode(import.meta.url)) {
    serverInit("abc", { prop1: true, prop2: 123, prop3: {} });
}