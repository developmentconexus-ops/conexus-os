export const errorField = (error: unknown, key: string): unknown =>
  typeof error === 'object' && error !== null && key in error ? Reflect.get(error, key) : undefined
