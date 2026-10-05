// The failure code is meta of a schema node, not a JSON Schema keyword. It leaves the node itself, so a property named failureCode survives.
export const dropFailureCode = ({ jsonSchema }) => { delete jsonSchema.failureCode }
