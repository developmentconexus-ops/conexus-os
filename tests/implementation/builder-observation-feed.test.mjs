import assert from 'node:assert/strict'
import test from 'node:test'
import { createObservationFeed } from '../../apps/hub/src/builder/observation-feed.ts'

const readAll = async (stream) => {
  const reader = stream.getReader()
  const frames = []
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) return frames
      frames.push(item.value)
    }
  } finally {
    reader.releaseLock()
  }
}

test('caps simultaneous subscribers and returns capacity after cancellation', async () => {
  const feed = createObservationFeed()
  const streams = Array.from({ length: 4 }, () => feed.subscribe())
  assert.equal(streams.every(Boolean), true)
  assert.equal(feed.subscribe(), null)
  await streams[0].cancel()
  assert.notEqual(feed.subscribe(), null)
  feed.close()
})

test('a waiting reader accepts a frame without an unaccounted native queue', async () => {
  const feed = createObservationFeed({ maxSubscriberBytes: 1 })
  const reader = feed.subscribe().getReader()
  const pending = reader.read()
  await new Promise(resolve => setImmediate(resolve))
  feed.publish('long-frame')
  assert.deepEqual(await pending, { done: false, value: 'long-frame' })
  feed.publish('a')
  feed.publish('b')
  await assert.rejects(reader.read(), /OBSERVATION_SUBSCRIBER_OVERFLOW/)
  feed.close()
  feed.close()
  feed.finish()
  feed.publish('ignored')
  assert.equal(feed.subscribe(), null)
})

test('captures the complete prefix and the live boundary without gaps or duplicates', async () => {
  const prefix = 'data: prefix\n\n'
  const live = 'data: live\n\n'
  const feed = createObservationFeed()
  feed.publish(prefix)
  const stream = feed.subscribe()
  assert.ok(stream)
  feed.publish(live)
  feed.finish()

  assert.deepEqual(await readAll(stream), [prefix, live])
})

test('cancelling one subscriber does not close another subscriber or the feed', async () => {
  const feed = createObservationFeed()
  const canceled = feed.subscribe()
  const retained = feed.subscribe()
  assert.ok(canceled)
  assert.ok(retained)
  const canceledReader = canceled.getReader()
  const pending = canceledReader.read()
  await canceledReader.cancel()
  assert.deepEqual(await pending, { done: true, value: undefined })

  const frame = 'data: retained\n\n'
  feed.publish(frame)
  feed.finish()
  assert.deepEqual(await readAll(retained), [frame])
})

test('finished feeds remain subscribable with the complete retained prefix, then EOF', async () => {
  const first = 'data: first\n\n'
  const second = 'data: second\n\n'
  const feed = createObservationFeed()
  feed.publish(first)
  feed.publish(second)
  feed.finish()

  const late = feed.subscribe()
  assert.ok(late)
  assert.deepEqual(await readAll(late), [first, second])

  feed.close()
  assert.equal(feed.subscribe(), null)
})

test('a retained prefix may exceed the subscriber delivery limit', async () => {
  const first = 'data: 1234\n\n'
  const second = 'data: 5678\n\n'
  const feed = createObservationFeed({ maxSubscriberBytes: 1 })
  feed.publish(first)
  feed.publish(second)
  feed.finish()

  const stream = feed.subscribe()
  assert.ok(stream)
  assert.deepEqual(await readAll(stream), [first, second])
})

test('UTF-8 byte limits overflow the whole feed instead of retaining a suffix', () => {
  const unicode = 'data: 😀\n\n'
  const bytes = new TextEncoder().encode(unicode).byteLength
  const feed = createObservationFeed({ maxBytes: bytes, maxFrames: 4 })
  feed.publish(unicode)
  assert.notEqual(feed.subscribe(), null)

  feed.publish('x')
  assert.equal(feed.subscribe(), null)
  feed.publish('ignored')
  feed.finish()
  assert.equal(feed.subscribe(), null)
})

test('frame limits overflow the whole feed', () => {
  const feed = createObservationFeed({ maxFrames: 1 })
  feed.publish('a')
  feed.publish('b')
  assert.equal(feed.subscribe(), null)
})

test('a held slow subscriber is bounded while a fast subscriber drains all frames', async () => {
  const frameA = 'data: a\n\n'
  const frameB = 'data: b\n\n'
  const feed = createObservationFeed({ maxSubscriberBytes: new TextEncoder().encode(frameA).byteLength })
  const slow = feed.subscribe()
  const fast = feed.subscribe()
  assert.ok(slow)
  assert.ok(fast)
  const slowReader = slow.getReader()
  const fastFrames = readAll(fast)
  await new Promise((resolve) => setImmediate(resolve))

  feed.publish(frameA)
  feed.publish(frameB)
  feed.finish()

  assert.deepEqual(await fastFrames, [frameA, frameB])
  await assert.rejects(slowReader.read(), /OBSERVATION_SUBSCRIBER_OVERFLOW/)
})

test('canceled readers resolve cleanly and do not reject later', async () => {
  const feed = createObservationFeed()
  const stream = feed.subscribe()
  assert.ok(stream)
  const reader = stream.getReader()
  const pending = reader.read()
  await reader.cancel()
  assert.deepEqual(await pending, { done: true, value: undefined })
  feed.publish('data: ignored\n\n')
  feed.finish()
})
