declare const request: { headers: Record<string, string | undefined>; cookies: Record<string, string | undefined>; raw: { headers: Record<string, string>; rawHeaders: string[] } }
declare const reply: { setCookie(name: string, value: string, options?: object): unknown; clearCookie(name: string, options?: object): unknown; header(name: string, value: string): unknown }
export const write = () => reply.setCookie('a', 'b')
