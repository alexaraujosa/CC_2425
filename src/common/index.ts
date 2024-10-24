/**
 * @module common
 * Common utilities to ensure consistency between the SERVER and the AGENT Solutions.
 * 
 * Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

/**
 * Nested property type for {@link TestType}.  
 * Also, did you know you can link to other entities with `@link`? Pretty neat.
 *
 * @interface TestTypeProp3
 */
export interface TestTypeProp3 {
    /** Inline roperty documentation. */
    prop1?: boolean,
    /**
     * Expanded property docuementation.  
     * It's probably here due to Intellisense.
     *
     * @type {TestType}
     * @memberof TestTypeProp3
     */
    prop2?: TestType
}

/**
 * An interface. Used to specifiy the types of objects. Pretty useful.
 */
export interface TestType {
    /**
     * Property documentation that takes a bit more space in the code. Doesn't matter in the docs.
     */
    prop1: boolean,
    /** Tiny and compact property documentation. */
    prop2: number,
    /** This property is special. Why? Because I said so. */
    prop3: TestTypeProp3
}

// console.log("Hello world from COMMON.");