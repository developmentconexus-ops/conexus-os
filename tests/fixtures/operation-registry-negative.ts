import { z } from 'zod'
import { operation, operationRegistry } from '@conexus/contract'

const getThing = operation({
  id: 'getThing', summary: 'Read a thing.', access: 'session', method: 'GET', path: '/api/control/things',
  params: null, query: null, headers: null, body: null,
  success: { 200: z.object({}) }, effects: [], failures: [], malformed: null,
})

operationRegistry({ getThing })
// @ts-expect-error The registry key differs from the id of the operation it holds.
operationRegistry({ readThing: getThing })

operation({
  id: 'getKnownThing', summary: 'Read a thing by id.', access: 'session', method: 'GET', path: '/api/control/things/:thingId',
  params: z.object({ thingId: z.uuid() }), query: null, headers: null, body: null,
  success: { 200: z.object({}) }, effects: [], failures: [],
  malformed: { thingId: 'NOT_FOUND' },
})
operation({
  id: 'getUnknownThing', summary: 'Read a thing by id.', access: 'session', method: 'GET', path: '/api/control/things/:thingId',
  params: z.object({ thingId: z.uuid() }), query: null, headers: null, body: null,
  success: { 200: z.object({}) }, effects: [], failures: [],
  // @ts-expect-error A path param with no malformed entry has no failure to answer.
  malformed: {},
})
