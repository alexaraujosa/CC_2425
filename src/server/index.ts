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
import { CreateIDevice } from "../db/interfaces/IDevice.js";

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
    const newDeviceData = CreateIDevice("192.168.1.10", 12345, 67890, "random_salt", [], new Date());
    const newDeviceData2 = CreateIDevice("192.16.1.10", 12345, 67890, "random_salt", [], new Date());

    try {
        const removeResult = await dbHandler.removeDevice(1); // Use await
        if (removeResult) {
            logger.success("Device com id 1 removido com sucesso.");
        } else {
            logger.warn("Nenhum device encontrado com id 1 para remover.");
        }
    } catch (error) {
        logger.error("Erro ao remover o device:", error);
    }

    try {
        const newDeviceId = await dbHandler.createDevice(newDeviceData);
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
        const removeResult = await dbHandler.removeTask(1); // Use await
        if (removeResult) {
            logger.success("Task com id 1 removido com sucesso.");
        } else {
            logger.warn("Nenhuma task encontrado com id 1 para remover.");
        }
    } catch (error) {
        logger.error("Erro ao remover a task:", error);
    }

    // Cria uma nova task
    const newTaskData = {
        id: 1, // Você pode gerar um ID único ou utilizar uma lógica para incrementos
        frequency: 5, // Exemplo: frequência de 5 minutos
        devices: [1], // Array de IDs de dispositivos (deixe vazio se não houver)
        metrics: {} // Inicia com um objeto vazio
    };

    try {
        const newTask = await dbHandler.createTask(newTaskData);
        logger.info("Task criada com sucesso:", newTask);
    } catch (error) {
        logger.error("Erro ao criar a task:", error);
    }

    try {
        await dbHandler.addMetrics(1, 1, {
            bandwidth: 150,
            jitter: 30,
            delay: 100
        });
    } catch (error) {
        logger.error("Erro ao adicionar metrics:", error);
    }

    try {
        await dbHandler.addMetrics(1, 1, {
            bandwidth: 180,
            jitter: 30,
            delay: 100
        });
    } catch (error) {
        logger.error("Erro ao adicionar metrics:", error);
    }

    const metrics = await dbHandler.getMetrics(1, 1); // Obtém métricas para a task com id 1 e device com id 1
    if (metrics) {
        logger.info("Métricas obtidas com sucesso:", JSON.stringify(metrics, null, 2));
    } else {
        logger.warn("Nenhuma métrica disponível.");
    }
}

if (isBinMode(import.meta.url)) {
    serverInit("abc", { prop1: true, prop2: 123, prop3: {} });
}