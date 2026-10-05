type Thing = { id: string }
declare const response: Response

export const asserted = async () => (await response.json()) as Thing

export const doubleAsserted = async () => (await response.json()) as unknown as Thing

export const helper = (reply: Response) => reply.json()

export const chained = () => fetch('/x').then((reply) => reply.json())

export const text = async () => response.text()
export const parsed = async () => JSON.parse(await response.text())
