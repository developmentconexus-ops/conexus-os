import { clearAuthorityCache } from '../app/query-client'

export type R2Response<T> = Readonly<{
  data: T
  response: Response
}>

export type R2EmptyResponse = Readonly<{
  response: Response
}>

export class R2RequestError extends Error {
  readonly status: number | null

  constructor(readonly response: Response | null) {
    super(response === null ? 'Request did not complete' : `Request failed with ${response.status}`)
    this.status = response?.status ?? null
  }
}

async function completed(request: Promise<Response>): Promise<Response> {
  try {
    return await request
  } catch {
    throw new R2RequestError(null)
  }
}

function reject(response: Response): never {
  if (response.status === 401) clearAuthorityCache()
  throw new R2RequestError(response)
}

export async function expectR2Json<T>(
  request: Promise<Response>,
  acceptedStatuses: readonly number[],
): Promise<R2Response<T>> {
  const response = await completed(request)
  if (!acceptedStatuses.includes(response.status)) reject(response)
  return { data: await response.clone().json() as T, response }
}

export async function expectR2Empty(
  request: Promise<Response>,
  acceptedStatuses: readonly number[],
): Promise<R2EmptyResponse> {
  const response = await completed(request)
  if (!acceptedStatuses.includes(response.status)) reject(response)
  return { response }
}
