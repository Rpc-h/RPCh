// generic result
export type ResultOk<V> = { success: true; res: V };
export type ResultErr<X> = { success: false; error: X };
export type Result<V, X = string> = ResultOk<V> | ResultErr<X>;

export function ok<V>(res: V): ResultOk<V> {
    return { success: true, res };
}

export function err<X>(error: X): ResultErr<X> {
    return { success: false, error };
}

export function isOk<V, X>(res: Result<V, X>): res is ResultOk<V> {
    return res.success;
}

export function isErr<V, X>(res: Result<V, X>): res is ResultErr<X> {
    return !res.success;
}

export function assertOk<V, X>(res: Result<V, X>): asserts res is ResultOk<V> {
    if (isErr(res)) {
        throw new Error('Not an OK result');
    }
}
