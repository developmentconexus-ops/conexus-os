export const SUBJECT_NOT_FOUND = { workspaceId: 'WORKSPACE_NOT_FOUND', projectId: 'PROJECT_NOT_FOUND' };
/** What every person admission answers before it looks at its subject: the Account is gone or was deactivated. */
export const ACCOUNT_REFUSALS = ['ACCOUNT_INACTIVE', 'ACCOUNT_NOT_FOUND'];
export const operation = (declaration) => Object.freeze(declaration);
export const operationRegistry = (declared) => Object.freeze(declared);
