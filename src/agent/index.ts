/**
 * Entry point for the AGENT Solution.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

import { TestType } from "$common/index.js";

/**
 * Example agent function with documentaton.
 * 
 * *Also* ~~Supports~~ **Markdown**
 */
export function agentInit(param1: string, param2: TestType) {
    console.log("Hello world from AGENT.");
}

agentInit("def", { prop1: false, prop2: 987, prop3: { prop1: true } });