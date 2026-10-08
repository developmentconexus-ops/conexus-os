import { ModelAccountId, ConnectionId } from '@conexus/contract'
import { Digest } from '../../apps/hub/src/platform/db.js'
import { createSecretEnvelope, modelAccountContext, connectionContext, sessionContext, handoffContext, SealedColumn, type SealContext, type Sealed } from '../../apps/hub/src/platform/secrets.js'
const envelope = createSecretEnvelope('ab'.repeat(32))
const model = modelAccountContext(ModelAccountId.parse('10000000-0000-4000-8000-000000000001'))
const connection = connectionContext(ConnectionId.parse('20000000-0000-4000-8000-000000000001'))
const session = sessionContext(Digest.parse(Buffer.alloc(32)))
const handoff = handoffContext(Digest.parse(Buffer.alloc(32)))
const modelBytes = SealedColumn('model-account').parse('example')
const connectionBytes = SealedColumn('connection').parse('example')
const sessionBytes = SealedColumn('hub-session').parse('example')
const handoffBytes = SealedColumn('handoff').parse('example')
envelope.open(modelBytes, model)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(modelBytes, connection)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(modelBytes, connection, model)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(modelBytes, session)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(modelBytes, session, model)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(modelBytes, handoff)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(modelBytes, handoff, model)
envelope.open(connectionBytes, connection)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(connectionBytes, model)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(connectionBytes, model, connection)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(connectionBytes, session)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(connectionBytes, session, connection)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(connectionBytes, handoff)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(connectionBytes, handoff, connection)
envelope.open(sessionBytes, session)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(sessionBytes, model)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(sessionBytes, model, session)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(sessionBytes, connection)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(sessionBytes, connection, session)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(sessionBytes, handoff)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(sessionBytes, handoff, session)
envelope.open(handoffBytes, handoff)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(handoffBytes, model)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(handoffBytes, model, handoff)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(handoffBytes, connection)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(handoffBytes, connection, handoff)
// @ts-expect-error ciphertext from a different owner cannot open or reseal here
envelope.open(handoffBytes, session)
// @ts-expect-error reseal source context retains its owner
envelope.reseal(handoffBytes, session, handoff)
// @ts-expect-error every seal needs immutable row context
envelope.seal('plain')
// @ts-expect-error every open needs immutable row context
envelope.open(modelBytes)
// @ts-expect-error raw bytes do not carry a sealed owner brand
envelope.open('plain', model)
// @ts-expect-error context cannot be forged structurally
const forged: SealContext<'model-account'> = { owner: 'model-account', binding: 'slot', aad: () => Buffer.alloc(0) }
// @ts-expect-error connection id is not a model account id
modelAccountContext(ConnectionId.parse('20000000-0000-4000-8000-000000000001'))
// @ts-expect-error schema-derived generic value remains concretely branded
const weak: Sealed<'model-account'> = 'plain'
// @ts-expect-error a generic seal result retains its concrete owner
const wrong: Promise<Sealed<'connection'>> = envelope.seal('plain', model)
void forged
void weak
void wrong
// @ts-expect-error explicit union type arguments cannot permit mismatched owners
envelope.open<'model-account' | 'connection'>(modelBytes, connection)
// @ts-expect-error explicit union type arguments cannot permit mismatched reseal source
envelope.reseal<'model-account' | 'connection', 'handoff'>(modelBytes, connection, handoff)
const ambiguousContext = Math.random() > 0.5 ? model : connection
// @ts-expect-error an ambiguous source context must be narrowed before opening
envelope.open(modelBytes, ambiguousContext)
// @ts-expect-error an ambiguous source context must be narrowed before resealing
envelope.reseal(modelBytes, ambiguousContext, handoff)
