/**
 * Entry point for the SERVER Solution.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { TestType } from "$common/index.js";

/**
 * Example server function with documentaton.
 * 
 * *Also* ~~Supports~~ **Markdown**
 */
export function serverInit(param1: string, param2: TestType) {
    console.log("Hello world from SERVER.");
}

serverInit("abc", { prop1: true, prop2: 123, prop3: {} });