type SessionRequest = Readonly<{ headers: Readonly<Record<string, string | string[] | undefined>> }>
declare const session: SessionRequest
const fetchSiteOf = (headers: SessionRequest['headers']) => headers['sec-fetch-site']
export const read = () => fetchSiteOf(session.headers)
