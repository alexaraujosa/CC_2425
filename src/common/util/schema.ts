/**
 * @description This module contains an implementation of a data syntax validation system. It allows the definition of a schema
 * that can be used both for compile-time type inference and runtime data validation.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
// import { getOrCreateGlobalLogger } from "$common/util/logger.js";
import { ObjectKey } from "$common/util/object.js";
import { isInvalid, isValid, makeInvalid, makeValid, Validation } from "$common/util/validation.js";

/**
 * Defines a validator for a Schema. A Schema can be any of the defined validators, as they can be used in nested hierarchies.
 */
interface SchemaValidator<T>  {
    /**
     * The runtime data assertion and processing function to be used for this validator.
     * @param data 
     */
    parse(data: unknown): Validation<T>,
    /**
     * The value that was used to initialize this validator, if any. Used in helper validators like partial to be able to access
     * the original validator properties.
     */
    _imprint: unknown
}

/**
 * Extracts the type structure from a given Schema. If the value used is not a schema, the bottom type (`never`) is returned.
 * 
 * @example
 * const schema = s.union(s.string(), s.number());
 * type SchemaType = InferSchema<typeof schema> // string | number
 */
type ExtractSchemaType<V> = V extends SchemaValidator<infer T> ? T : never;

function makeSchemaValidator<T>(parser: SchemaValidator<T>["parse"], imprint?: unknown): SchemaValidator<T> {
    return {
        parse: parser,
        _imprint: imprint
    };
}

const s = {
    /**
     * Represents an optional value.
     * 
     * @param val Any Schema to be made optional.
     */
    nullable<T extends SchemaValidator<any>>(val: T): SchemaValidator<ExtractSchemaType<T> | undefined> {
        return makeSchemaValidator(function(data) {
            if (data === undefined) return makeValid(data);

            const validation = val.parse(data);
            if (isInvalid(validation)) return validation;

            // return <ExtractSchemaType<T>>data;
            return makeValid(<ExtractSchemaType<T>>data);
        }, val);
    },
    /**
     * Represents a partial {@link s.object|Object Schema}. For a given Object Schema, all it's root-level keys are made optional.
     * This effect can also be achieved by making all properties of the object {@link s.nullable|nullable}.
     * 
     * @param val An {@link s.object|Object} Schema.
     */
    partial<T extends SchemaValidator<Record<string, unknown>>>(
        val: T
    ): SchemaValidator<{ [K in keyof ExtractSchemaType<T>]?: ExtractSchemaType<T>[K] }> {
        return makeSchemaValidator(function(data) {
            if (typeof data !== "object" || data === null) return makeInvalid(new Error("Data is not an object."));
            
            const imprint = <Record<string, SchemaValidator<any>>>val._imprint;
            for (const key in imprint) {
                if (!(key in data)) continue;

                const validation = imprint[<keyof typeof imprint>key].parse(data[<keyof typeof data>key]);
                if (isInvalid(validation)) return makeInvalid(
                    new Error(`Invalid value for object key '${key}'.`, { cause: validation.error })
                );
            }

            return makeValid(data);
        }, val._imprint);
    },
    /**
     * Represents a type union of the given Schemas. The resulting Schema accepts any value that satisfies at least one
     * of the Schemas passed as constraints.
     * 
     * @param elements Any Schemas to be used as constraints for the union.
     */
    union<T extends SchemaValidator<any>[]>(...elements: T): SchemaValidator<ExtractSchemaType<T[number]>> {
        return makeSchemaValidator(function(data) {
            for (const val of elements) {
                const validation = val.parse(data);
                if (isValid(validation)) return validation;
            }

            return makeInvalid(new Error("Data does not fit union constraints."));
        });
    },
    /**
     * Represents a boolean value.
     */
    boolean(): SchemaValidator<boolean> {
        return makeSchemaValidator(function(data) {
            if (typeof data === "boolean") {
                return makeValid(data);
            } else {
                return makeInvalid(new Error("Data is not a boolean."));
            }
        });
    },
    /**
     * Represents any string value.
     */
    string(): SchemaValidator<string> {
        return makeSchemaValidator(function(data) {
            if (typeof data === "string") {
                return makeValid(data);
            } else {
                return makeInvalid(new Error("Data is not a string."));
            }
        });
    },
    /**
     * Represents a specific string literal. A parsed value is only valid if and only if it is exactly equal to the imprint. 
     */
    stringLiteral<T extends string>(val: T): SchemaValidator<T> {
        return makeSchemaValidator(function(data) {
            if (typeof data !== "string") return makeInvalid(new Error("Data is not a string."));

            if (data === val) return makeValid(<T>data);
            else return makeInvalid(new Error("Data is not equal to control."));
        }, val);
    },
    /**
     * Represents any numeric value.
     */
    number(): SchemaValidator<number> {
        return makeSchemaValidator(function(data) {
            if (typeof data === "number") {
                return makeValid(data);
            } else {
                return makeInvalid(new Error("Data is not a number."));
            }
        });
    },
    /**
     * Represents an object with well-defined properties.
     * 
     * @param val An object with defined key-value-pairs of Schemas.
     */
    object<T extends Record<string, SchemaValidator<any>>>(val: T): SchemaValidator<{ [K in keyof T]: ExtractSchemaType<T[K]> }> {
        return makeSchemaValidator(function(data) {
            if (typeof data !== "object" || data === null) return makeInvalid(new Error("Data is not an object."));

            for (const key in val) {
                // Cast is used here because the parser should fail for undefined keys unless it's a nullable.
                const validation = val[key].parse(data[<keyof typeof data>key]);
                if (isInvalid(validation)) {
                    if (!(key in data)) return makeInvalid(new Error(`Missing property in data: '${key}'.`));

                    return makeInvalid(
                        new Error(`Invalid value for object key '${key}'.`, { cause: validation.error })
                    );
                }
            }

            return makeValid(<{ [K in keyof T]: ExtractSchemaType<T[K]> }>data);
        }, val);
    },
    /**
     * Represents any object whose keys follow the schema of the passed key, and whose values follow the schema of the passed value.
     * 
     * @param key The Schema for the keys of the object.
     * @param val The Schema for the values of the object.
     */
    record<K extends SchemaValidator<ObjectKey>, V extends SchemaValidator<unknown>>(
        key: K, 
        val: V
    ): SchemaValidator<Record<ExtractSchemaType<K>, ExtractSchemaType<V>>> {
        return makeSchemaValidator(function(data) {
            if (typeof data !== "object" || data === null || Array.isArray(data)) return makeInvalid(
                new Error("Data is not an object.")
            );

            for (const k of Object.keys(data)) {
                const validKey = key.parse(k);
                if (isInvalid(validKey)) return makeInvalid(new Error(`Invalid key for record: '${k}'.`, { cause: validKey.error }));
                
                const validValue = val.parse(data[<keyof typeof data>k]);
                if (isInvalid(validValue)) return makeInvalid(
                    new Error(`Invalid value for record entry '${k}'.`, { cause: validValue.error })
                );
            }

            return makeValid(<Record<ExtractSchemaType<K>, ExtractSchemaType<V>>>data);
        });
    },
    /**
     * Represents an array whose elements follow the passed Schema.
     * 
     * @param val The Schema for all elements of the array.
     * @returns 
     */
    array<T extends SchemaValidator<any>>(val: T): SchemaValidator<ExtractSchemaType<T>[]> {
        return makeSchemaValidator(function(data) {
            if (typeof data !== "object" || data === null || !Array.isArray(data)) 
                return makeInvalid(new Error("Data is not an array."));

            for (let i = 0; i < data.length; i++) {
                const elem = data[i];
                const validation = val.parse(elem);

                if (isInvalid(validation)) return makeInvalid(new Error(
                    `Invalid element at index ${i}.`,
                    { cause: validation.error }
                ));
            }

            return makeValid(<ExtractSchemaType<T>[]>data);
        });
    }
} as const;

export {
    type SchemaValidator,
    type ExtractSchemaType as InferSchema,
    s
};

// const logger = getOrCreateGlobalLogger({ debug: true, printCallerFile: true });

// const test = s.object({
//     a: s.string(),
//     b: s.array(s.number()),
//     c: s.record(s.string(), s.array(s.string())),
//     d: s.partial(s.object({
//         da: s.stringLiteral("Hello there"),
//         db: s.record(s.string(), s.nullable(s.string())),
//         dc: s.union(s.string(), s.number())
//     }))
// });
// type Test = ExtractSchemaType<typeof test>

// const testVal = test.parse({
//     a: "123",
//     b: [123],
//     c: {
//         123: ["456", "123", "987"]
//     },
//     d: {
//         da: "Hello there",
//         db: {
//             123: undefined,
//             456: "123"
//         },
//         dc: "123"
//     }
// });
// logger.log("TEST VAL:", testVal);
