import { createServer } from 'node:http'

// A local stand-in for the Sankhya gateway on 127.0.0.1. It records every request, issues numbered
// short-lived tokens and answers loadRecords from a fixed purchase order. No test ever reaches a
// Sankhya host: the broker receives this origin through the adapter factory, not configuration.

export const SECRET_MARKER = 'SECRET-MARKER-7f3a9c'
export const FAKE_CREDENTIAL = Object.freeze({ clientId: 'fake-client-id', clientSecret: 'fake-client-secret-5d1e', xToken: 'fake-x-token-88b2' })

const HEADERS = [{
  NUNOTA: '9001', NUMNOTA: '22790', DTNEG: '24/09/2026', STATUSNOTA: 'L', VLRNOTA: '1520.50', TIPMOV: 'O',
  Parceiro_NOMEPARC: 'Fornecedor Exemplo Ltda', SENHA: SECRET_MARKER,
}]
const ITEMS = [
  { NUNOTA: '9001', SEQUENCIA: '1', CODPROD: '501', QTDNEG: '10', CODVOL: 'UN', VLRUNIT: '100.05', VLRTOT: '1000.50', Produto_DESCRPROD: 'Parafuso' },
  { NUNOTA: '9001', SEQUENCIA: '2', CODPROD: '502', QTDNEG: '4', CODVOL: 'CX', VLRUNIT: '130', VLRTOT: '520', Produto_DESCRPROD: 'Arruela' },
]

/** What the broker must answer for document 22790 from the rows above. */
export const EXPECTED_ORDER_22790 = Object.freeze({
  orders: [{
    number: 22790, internalId: '9001', date: '2026-09-24', supplier: 'Fornecedor Exemplo Ltda', status: 'confirmed', total: '1520.50',
    items: [
      { sequence: 1, productCode: '501', description: 'Parafuso', quantity: '10', unit: 'UN', unitPrice: '100.05', total: '1000.50' },
      { sequence: 2, productCode: '502', description: 'Arruela', quantity: '4', unit: 'CX', unitPrice: '130', total: '520' },
    ],
  }],
})

export const HEADER_FIELDS = 'NUNOTA,NUMNOTA,DTNEG,STATUSNOTA,VLRNOTA'
export const ITEM_FIELDS = 'NUNOTA,SEQUENCIA,CODPROD,QTDNEG,CODVOL,VLRUNIT,VLRTOT'

const entities = (fieldNames, rows, { extraField = false } = {}) => {
  const names = extraField ? [...fieldNames, 'SENHA'] : fieldNames
  const encoded = rows.map((row) => Object.fromEntries(names.map((name, index) => [`f${index}`, row[name] === undefined ? {} : { $: row[name] }])))
  return {
    total: String(rows.length), hasMoreResult: 'false', offsetPage: '0', offset: '0',
    metadata: { fields: { field: names.map((name) => ({ name })) } },
    ...(rows.length === 0 ? {} : { entity: encoded.length === 1 ? encoded[0] : encoded }),
  }
}

const loadRecords = (dataSet, options) => {
  const [root, ...references] = dataSet.entity
  const fields = [...root.fieldset.list.split(','), ...references.flatMap((reference) => reference.fieldset.list.split(',').map((field) => `${reference.path}_${field}`))]
  const values = dataSet.criteria.parameter.map((parameter) => parameter.$)
  const rows = dataSet.rootEntity === 'CabecalhoNota'
    ? HEADERS.filter((row) => row.NUMNOTA === values[0] && row.TIPMOV === 'O')
    : ITEMS.filter((row) => values.includes(row.NUNOTA))
  return entities(fields, rows, options)
}

/**
 * `mode` picks one failure at a time: authenticate one of 'ok' | 401 | 500 | 'stall'; service one of
 * 'ok' | 401 | 500 | 'envelope-error' | 'oversized' | 'extra-field' | 'stall' | 'refuse-first-token'.
 */
export const startFakeGateway = async ({ expiresInSeconds = 90 } = {}) => {
  const requests = []
  const mode = { authenticate: 'ok', service: 'ok' }
  let issued = 0
  const sockets = new Set()
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const url = new URL(request.url, 'http://fake')
      const text = Buffer.concat(chunks).toString('utf8')
      const record = {
        method: request.method, path: url.pathname, serviceName: url.searchParams.get('serviceName'), outputType: url.searchParams.get('outputType'),
        authorization: request.headers.authorization ?? null, xToken: request.headers['x-token'] ?? null, contentType: request.headers['content-type'] ?? null,
        form: url.pathname === '/authenticate' ? Object.fromEntries(new URLSearchParams(text)) : null,
        body: url.pathname === '/authenticate' ? null : JSON.parse(text || 'null'),
      }
      requests.push(record)
      const send = (status, body, statusMessage = 'OK') => {
        const payload = typeof body === 'string' ? body : JSON.stringify(body)
        response.writeHead(status, statusMessage, { 'content-type': 'application/json', 'x-provider-secret': SECRET_MARKER })
        response.end(payload)
      }
      if (url.pathname === '/authenticate') {
        if (mode.authenticate === 'stall') return
        if (mode.authenticate !== 'ok') return send(mode.authenticate, { error: 'invalid_client', error_description: SECRET_MARKER }, SECRET_MARKER)
        issued += 1
        return send(200, { access_token: `fake-token-${issued}`, expires_in: expiresInSeconds, refresh_expires_in: 0, token_type: 'Bearer', 'not-before-policy': 0, scope: 'profile' })
      }
      if (url.pathname !== '/gateway/v1/mge/service.sbr') return send(404, { error: SECRET_MARKER })
      const service = mode.service
      if (service === 'stall') return
      if (service === 401 || (service === 'refuse-first-token' && record.authorization === 'Bearer fake-token-1')) return send(401, { error: 'invalid_token', detail: SECRET_MARKER }, SECRET_MARKER)
      if (service === 500) return send(500, `<html>${SECRET_MARKER}</html>`, SECRET_MARKER)
      if (service === 'envelope-error') return send(200, { serviceName: record.serviceName, status: '0', statusMessage: `Falha ${SECRET_MARKER}`, pendingPrinting: 'false' })
      if (service === 'oversized') return send(200, { serviceName: record.serviceName, status: '1', padding: 'x'.repeat(300 * 1024) })
      return send(200, {
        serviceName: record.serviceName, status: '1', pendingPrinting: 'false', transactionId: SECRET_MARKER,
        responseBody: { entities: loadRecords(record.body.requestBody.dataSet, { extraField: service === 'extra-field' }) },
      })
    })
  })
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    requests,
    mode,
    issued: () => issued,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
