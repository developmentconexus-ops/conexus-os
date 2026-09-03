const PROJECT_IDENTITY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const isProjectIdentity = (value: string): boolean => PROJECT_IDENTITY.test(value)
