declare const request: { headers: Record<string, string | undefined>; cookies: Record<string, string | undefined>; raw: { headers: Record<string, string>; rawHeaders: string[] } }
declare const reply: { setCookie(name: string, value: string, options?: object): unknown; clearCookie(name: string, options?: object): unknown; header(name: string, value: string): unknown }
const API_KEY_HEADER = 'x-goog-api-key'
const KEYS = ['x-a', 'x-b'] as const
export const read = (key: (typeof KEYS)[number]) => [request.headers[API_KEY_HEADER], request.headers[key]]
