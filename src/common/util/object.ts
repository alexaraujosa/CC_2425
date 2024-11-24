/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A type that can be used as a key for an object.
 */
type ObjectKey = string | number | symbol;

/**
 * A type that can be used to represent any generic object.
 */
type GenericObject = Record<ObjectKey, unknown>;

/**
 * Asserts that, given an object of objects following the same structure and a property key, the value of said property
 * is unique amongst all objects inside the root object.
 */
type AssertUniqueProperty<
    T extends Record<string, Record<K, ObjectKey>>,
    K extends ObjectKey
> = {
    [_K in keyof T]: T[_K][K] extends infer V
        ? V extends keyof { [K2 in keyof Omit<T, _K> as T[K2][K]]: true }
            ? never
            : T[_K]
        : never
};

type RemoveUndefined<T> = {
    [K in keyof T as undefined extends T[K] ? never : K]: T[K];
};
  

// pulled this from https://github.com/nodejs/node/issues/34355#issuecomment-658394617
function deepClone<T extends object>(o: T): T {
    if (typeof o !== "object") return o;
    if (!o) return o;

    // https://jsperf.com/deep-copy-vs-json-stringify-json-parse/25
    if (Array.isArray(o)) {
        const newO = [];
        for (let i = 0; i < o.length; i += 1) {
            const val = !o[i] || typeof o[i] !== "object" ? o[i] : deepClone(o[i]);
            newO[i] = val === undefined ? null : val;
        }

        return newO as T;
    }

    const newO: T = {} as T;
    for (const i of Object.keys(o)) {
        const val = !o[i as keyof typeof o] 
            || typeof o[i as keyof typeof o] !== "object" 
            ? o[i as keyof typeof o] 
            : deepClone(o[i as keyof typeof o] as object);

        if (val === undefined) continue;
        newO[i as keyof typeof o] = val as T[keyof T];
    }

    return newO;
}

/**
 * Deeply merges two objects. This function takes two objects and returns a single object containing the defined properties
 * of each object. If properties are duplicated, they are deeply merged if they are both objects, or replaced by the property
 * on the second object.
 * 
 * @param obj1 The first object to be merged.
 * @param obj2 The second object to be merged. Has higher priority in overrides.
 * @returns An object containing the merged properties of both.
 */
// function deepMerge<T extends Record<string, unknown>, U extends Record<string, unknown>>(obj1: T, obj2: U): T & U {
//     const result: T & U = <never>{};

//     for (const key in obj1) {
//         if (key in obj2) {
//             if (obj2[key]) {
//                 if (
//                     typeof obj1[key] === "object" 
//                     && typeof obj2[key] === "object" 
//                     && !Array.isArray(obj1[key]) 
//                     && !Array.isArray(obj2[key])
//                 ) {
//                     // Requires explicit typing and bottom-limiting because Typescript is narrowing each object to
//                     // Record<ObjectKey, string>, for some god forsaken reason.
//                     result[key] = <never>deepMerge(<Record<ObjectKey, unknown>>obj1[key], <Record<ObjectKey, unknown>>obj2[key]);
//                 } else {
//                     result[key] = <never>obj2[key];
//                 }
//             } else {
//                 result[key] = <never>obj1[key];
//             }
//         }
//     }

//     for (const key in obj1) {
//         if (key in obj2) continue; // Already resolved

//         result[key] = <never>obj2[key];
//     }

//     return result;
// }
// function deepMerge(..._: never[]) {
//     // Turns out, this is a bigger problem than I expected, and I'm not dealing with this shit before a funeral.
//     throw new Error("Not implemented.");
// }

//#region ============== Deep Merge ==============
// Vendored from https://github.com/voodoocreation/ts-deepmerge/blob/master/src/index.ts @ 2024-11-20T01:17:39.156Z
type TAllKeys<T> = T extends any ? keyof T : never;

type TIndexValue<T, K extends PropertyKey, D = never> = T extends any
    ? K extends keyof T
        ? T[K]
        : D
    : never;

type TPartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>> extends infer O
    ? { [P in keyof O]: O[P] }
    : never;

type TFunction = (...a: any[]) => any;

type TPrimitives =
    | string
    | number
    | boolean
    | bigint
    | symbol
    | Date
    | TFunction;

type TMerged<T> = [T] extends [Array<any>]
    ? { [K in keyof T]: TMerged<T[K]> }
    : [T] extends [TPrimitives]
        ? T
        : [T] extends [object]
            ? TPartialKeys<{ [K in TAllKeys<T>]: TMerged<TIndexValue<T, K>> }, never>
            : T;

// istanbul ignore next
const isObject = (obj: any) => {
    if (typeof obj === "object" && obj !== null) {
        if (typeof Object.getPrototypeOf === "function") {
            const prototype = Object.getPrototypeOf(obj);
            return prototype === Object.prototype || prototype === null;
        }

        return Object.prototype.toString.call(obj) === "[object Object]";
    }

    return false;
};

interface IObject {
    [key: string]: any;
}

export const merge = <T extends IObject[]>(...objects: T): TMerged<T[number]> =>
    objects.reduce((result, current) => {
        if (Array.isArray(current)) {
            throw new TypeError(
                "Arguments provided to ts-deepmerge must be objects, not arrays.",
            );
        }

        Object.keys(current).forEach((key) => {
            if (["__proto__", "constructor", "prototype"].includes(key)) {
                return;
            }

            if (Array.isArray(result[key]) && Array.isArray(current[key])) {
                result[key] = merge.options.mergeArrays
                    ? merge.options.uniqueArrayItems
                        ? Array.from(
                            new Set((result[key] as unknown[]).concat(current[key])),
                        )
                        : [...result[key], ...current[key]]
                    : current[key];
            } else if (isObject(result[key]) && isObject(current[key])) {
                result[key] = merge(result[key] as IObject, current[key] as IObject);
            } else {
                result[key] =
                current[key] === undefined
                    ? merge.options.allowUndefinedOverrides
                        ? current[key]
                        : result[key]
                    : current[key];
            }
        });

        return result;
    }, {}) as any;

interface IMergeOptions {
    /**
     * When `true`, values explicitly provided as `undefined` will override existing values, though properties that are simply omitted won't affect anything.
     * When `false`, values explicitly provided as `undefined` won't override existing values.
     *
     * Default: `true`
     */
    allowUndefinedOverrides: boolean;

    /**
     * When `true` it will merge array properties.
     * When `false` it will replace array properties with the last instance entirely instead of merging their contents.
     *
     * Default: `true`
     */
    mergeArrays: boolean;

    /**
     * When `true` it will ensure there are no duplicate array items.
     * When `false` it will allow duplicates when merging arrays.
     *
     * Default: `true`
     */
    uniqueArrayItems: boolean;
}

const defaultMergeOptions: IMergeOptions = {
    allowUndefinedOverrides: true,
    mergeArrays: true,
    uniqueArrayItems: true,
};

merge.options = defaultMergeOptions;
merge.withOptions = <T extends IObject[]>(options: Partial<IMergeOptions>, ...objects: T) => {
    merge.options = {
        ...defaultMergeOptions,
        ...options,
    };

    const result = merge(...objects);

    merge.options = defaultMergeOptions;

    return result;
};
//#endregion ============== Deep Merge ==============

/**
 * Removes all properties in an object whose value is "undefined".
 * 
 * @param obj The object to clean.
 * @returns An object with only defined properties.
 */
function dropEmpty<T extends Record<ObjectKey, unknown>>(obj: T): RemoveUndefined<T> {
    const ret = deepClone(obj);
    Object.keys(ret).forEach(key => ret[key] === undefined ? delete ret[key] : {});

    return ret;
}

export {
    type ObjectKey,
    type GenericObject,

    type AssertUniqueProperty,
    type IMergeOptions,
    type TMerged,

    deepClone,
    merge as deepMerge,
    dropEmpty
};