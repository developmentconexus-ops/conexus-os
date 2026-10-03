// JSON and response bodies are outside data: they arrive as unknown and are parsed at the boundary.
interface JSON {
  parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown
}
interface Body {
  json(): Promise<unknown>
}
