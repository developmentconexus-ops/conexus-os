declare const request: { headers: Record<string, string | undefined> }
export const strip = (name: string) => delete request.headers[name]
