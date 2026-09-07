import { Ajv2020 } from 'ajv/dist/2020.js'

export type SankhyaEnvironment = 'SANDBOX' | 'PRODUCTION'
export type SankhyaConfiguration = Readonly<{
  environment: SankhyaEnvironment
  companyCode: number
}>
export type SankhyaCredentialInput = Readonly<{
  clientId: string
  clientSecret: string
  xToken: string
}>

const configurationSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: Object.freeze(['environment', 'companyCode']),
  properties: Object.freeze({
    environment: Object.freeze({ type: 'string', enum: Object.freeze(['SANDBOX', 'PRODUCTION']) }),
    companyCode: Object.freeze({ type: 'integer', minimum: 1, maximum: 2_147_483_647 }),
  }),
})

const credentialInputSchema = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: Object.freeze(['clientId', 'clientSecret', 'xToken']),
  properties: Object.freeze({
    clientId: Object.freeze({ type: 'string', minLength: 1 }),
    clientSecret: Object.freeze({ type: 'string', minLength: 1 }),
    xToken: Object.freeze({ type: 'string', minLength: 1 }),
  }),
})

export const sankhyaOmConnectorDefinition = Object.freeze({
  connectorDefinitionId: 'sankhya-om',
  connectorVersion: '1.0.0',
  configurationSchema,
  credentialInputSchema,
  origins: Object.freeze({
    SANDBOX: 'https://api.sandbox.sankhya.com.br',
    PRODUCTION: 'https://api.sankhya.com.br',
  }),
  authentication: Object.freeze({
    method: 'POST',
    path: '/authenticate',
    contentType: 'application/x-www-form-urlencoded',
    grantType: 'client_credentials',
    xTokenHeader: 'X-Token',
    redirect: 'error',
  }),
  capabilities: Object.freeze([
    Object.freeze({
      capabilityId: 'sankhya.company.read.v1',
      method: 'GET',
      pathTemplate: '/v1/empresas/{serverResolvedCompanyCode}',
      effect: 'READ_ONLY',
      redirect: 'error',
    }),
  ]),
})

const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateConfiguration = ajv.compile<SankhyaConfiguration>(configurationSchema)
const validateCredentialInput = ajv.compile<SankhyaCredentialInput>(credentialInputSchema)

export const isSankhyaConfiguration = (value: unknown): value is SankhyaConfiguration =>
  validateConfiguration(value)

export const isSankhyaCredentialInput = (value: unknown): value is SankhyaCredentialInput =>
  validateCredentialInput(value)

export const resolveSankhyaOrigin = (environment: SankhyaEnvironment): string => {
  if (environment === 'SANDBOX') return sankhyaOmConnectorDefinition.origins.SANDBOX
  if (environment === 'PRODUCTION') return sankhyaOmConnectorDefinition.origins.PRODUCTION
  throw new Error('SANKHYA_ENVIRONMENT_REFUSED')
}
