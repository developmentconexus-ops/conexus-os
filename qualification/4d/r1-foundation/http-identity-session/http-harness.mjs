import Fastify from 'fastify'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

export const generatedRoutes = Object.freeze([
  Object.freeze({
    generatedId: 'FIXTURE-01',
    method: 'POST',
    url: '/fixture/echo',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['count', 'label'],
        properties: {
          count: { type: 'integer', minimum: 0 },
          label: { type: 'string', minLength: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['count', 'label'],
          properties: {
            count: { type: 'integer' },
            label: { type: 'string' },
          },
        },
      },
    },
  }),
  Object.freeze({
    generatedId: 'FIXTURE-02',
    method: 'GET',
    url: '/fixture/ready',
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['ready'],
          properties: { ready: { const: true } },
        },
      },
    },
  }),
])

export const createHttpHarness = async () => {
  const app = Fastify({ logger: false })
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  })
  addFormats(ajv)
  let validatorCompilerInstallCount = 0
  app.setValidatorCompiler(({ schema }) => ajv.compile(schema))
  validatorCompilerInstallCount += 1

  const allowed = new Map(generatedRoutes.map(route => [route.generatedId, route]))
  const registered = []
  const surface = Object.freeze({
    route(definition, handler) {
      const canonical = allowed.get(definition.generatedId)
      if (!canonical || canonical !== definition) throw new Error('UNGENERATED_ROUTE')
      if (registered.includes(definition.generatedId)) throw new Error('DUPLICATE_GENERATED_ROUTE')
      registered.push(definition.generatedId)
      app.route({ method: definition.method, url: definition.url, schema: definition.schema, handler })
    },
  })

  surface.route(generatedRoutes[0], async request => ({ ...request.body }))
  surface.route(generatedRoutes[1], async () => ({ ready: true }))
  await app.ready()

  return Object.freeze({
    inject: options => app.inject(options),
    close: () => app.close(),
    registerFeature: feature => feature(surface),
    routeCensus: () => [...registered].sort(),
    validatorCompilerInstallCount: () => validatorCompilerInstallCount,
    exposedSurfaceKeys: () => Object.keys(surface).sort(),
  })
}
