import type { z } from 'zod';
import type { FailureCode } from './failures.generated.js';
export declare const SUBJECT_NOT_FOUND: {
    readonly workspaceId: "WORKSPACE_NOT_FOUND";
    readonly projectId: "PROJECT_NOT_FOUND";
};
export type AccessKind = 'navigation' | 'sign-in' | 'session' | 'sign-out' | 'host-write' | 'hub-entry';
export type Effect = 'clear-session-cookie';
export type Binary = Readonly<{
    mediaType: 'image/png';
    maxBytes: number;
    cache?: 'revalidate-private';
}>;
export type NoContent = null;
type Part = z.ZodType | null;
type KeysOfUnion<T> = T extends unknown ? keyof T : never;
type BodyFields<Body extends Part> = Body extends z.ZodType ? KeysOfUnion<z.output<Body>> : never;
/** The failure a refused value answers: one entry for every path param, and one for each body field that has its own failure. */
type Malformed<Params extends Part, Body extends Part> = Params extends z.ZodType ? {
    readonly [K in keyof z.output<Params>]: FailureCode;
} & {
    readonly [K in BodyFields<Body>]?: FailureCode;
} : {
    readonly [K in BodyFields<Body>]?: FailureCode;
} | null;
export type Success = Readonly<{
    200: z.ZodType;
    201?: z.ZodType;
}> | Readonly<{
    201: z.ZodType;
    200?: z.ZodType;
}> | Readonly<{
    204: null;
}> | Readonly<{
    200: Binary;
}>;
export type Operation<Id extends string = string, Access extends AccessKind = AccessKind, Params extends Part = Part, Query extends Part = Part, Headers extends Part = Part, Body extends Part = Part, Successes extends Success = Success, Failures extends readonly FailureCode[] = readonly FailureCode[], Effects extends readonly Effect[] = readonly Effect[]> = Readonly<{
    id: Id;
    summary: string;
    access: Access;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    params: Params;
    query: Query;
    headers: Headers;
    body: Body;
    success: Successes;
    effects: Effects;
    failures: Failures;
    malformed: Malformed<Params, Body>;
}>;
export type AnyOperation = Operation;
export type JsonOperation = AnyOperation & Readonly<{
    success: Exclude<Success, {
        readonly 200: Binary;
    }>;
}>;
export type BinaryOperation = AnyOperation & Readonly<{
    success: {
        readonly 200: Binary;
    };
}>;
export type Out<P> = P extends z.ZodType ? z.output<P> : undefined;
export type Input<O extends AnyOperation> = Readonly<{
    params: Out<O['params']>;
    query: Out<O['query']>;
    headers: Out<O['headers']>;
    body: Out<O['body']>;
}>;
type Statuses<O extends AnyOperation> = keyof O['success'] & number;
type BodyOf<S> = S extends z.ZodType ? z.output<S> : S extends null ? undefined : S extends Binary ? (S extends {
    readonly cache: 'revalidate-private';
} ? Readonly<{
    bytes: Uint8Array;
    etag: string;
}> : Uint8Array) : never;
type StatusBody<O extends AnyOperation, S extends number> = S extends keyof O['success'] ? BodyOf<O['success'][S]> : never;
type IsUnion<T, Whole = T> = T extends unknown ? ([Whole] extends [T] ? false : true) : never;
export type Reply<O extends AnyOperation> = true extends IsUnion<Statuses<O>> ? {
    [S in Statuses<O>]: {
        status: S;
        body: StatusBody<O, S>;
    };
}[Statuses<O>] : StatusBody<O, Statuses<O>>;
export type EffectsOf<E extends readonly Effect[]> = {
    readonly [K in E[number]]: () => void;
};
type PathDeclaration<O extends AnyOperation> = O['path'] extends `${string}:${string}` ? O['malformed'] extends null ? never : unknown : unknown;
export declare const operation: <const O extends AnyOperation>(declaration: O & PathDeclaration<O> & Readonly<{
    malformed: Malformed<O["params"], O["body"]>;
}>) => O;
export declare const operationRegistry: <const R extends Readonly<Record<string, AnyOperation>>>(declared: R & { readonly [K in keyof R]: {
    readonly id: K;
}; }) => R;
export {};
