export type RegistryQueryClient = Readonly<{
  query(statement: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}>
