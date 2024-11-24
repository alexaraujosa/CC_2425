/**
 * @module Config
 * 
 * @description This modules contains type definitions and assertions related to validation status.
 * It should be returned by functions that are meant to return a validation status related to something.
 * 
 * @copyright Copyright (c) 2024 DarkenLM https://github.com/DarkenLM
 */

/**
 * Represents an invalid state. It may also have an error associated with it.
 */
type Invalid = Readonly<{ valid: false, error?: Error }>;
function makeInvalid(error?: Error): Invalid {
    return { valid: false, error };
}

/**
 * Represents a valid state.
 */
type Valid<T> = Readonly<{ valid: true, value?: T }>;
function makeValid<T>(value?: T): Valid<T> {
    return { valid: true, value };
}

/**
 * Represents a validation state, not yet asserted.
 */
type Validation<T> = Invalid | Valid<T>;

/**
 * Type assertion for whether a validation state is {@link Valid}.
 */
function isValid<T>(v: Validation<T>): v is Valid<T> {
    return v.valid;
}

/**
 * Type assertion for whether a validation state is {@link Invalid}.
 */
function isInvalid<T>(v: Validation<T>): v is Invalid {
    return !v.valid;
}

/**
 * Type assertion for whether a value is a {@link Validation} state.
 */
function isValidation<T>(v: unknown): v is Validation<T> {
    return typeof v === "object" && v !== null && "valid" in v && typeof v.valid === "boolean";
}

/**
 * A shorthand for a {@link Valid} state.
 */
const VALID = makeValid<never>();

/**
 * A shorthand for an {@link Invalid} state, with no error associated.
 */
const INVALID = makeInvalid();

export {
    type Invalid,
    type Valid,
    type Validation,

    VALID,
    INVALID,

    makeValid,
    makeInvalid,

    isValid,
    isInvalid,
    isValidation
};