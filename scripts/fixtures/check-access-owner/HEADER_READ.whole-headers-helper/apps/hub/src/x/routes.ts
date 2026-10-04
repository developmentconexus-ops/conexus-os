/// <reference types="node" />
import type { IncomingHttpHeaders } from 'node:http'
declare const request: { headers: IncomingHttpHeaders }
const originOf = (headers: IncomingHttpHeaders) => headers.origin
export const read = () => originOf(request.headers)
