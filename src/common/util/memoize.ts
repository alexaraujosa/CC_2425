const MEMOIZE_MAP = new WeakMap();

function memoize<T>(value: () => T): T {
    if (!MEMOIZE_MAP.has(value)) MEMOIZE_MAP.set(value, value());

    return <T>MEMOIZE_MAP.get(value);
}

function preparedMemoize<T>(value: () => T): () => T {
    return () => {
        return memoize(value);
    };
}

export default memoize;
export {
    memoize,
    preparedMemoize
};