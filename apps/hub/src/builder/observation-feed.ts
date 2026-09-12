type FeedState = 'OPEN' | 'FINISHED' | 'OVERFLOWED' | 'CLOSED'

type FeedOptions = Readonly<{
  maxBytes?: number
  maxFrames?: number
  maxSubscriberBytes?: number
}>

type FeedLimits = Readonly<{
  maxBytes: number
  maxFrames: number
  maxSubscriberBytes: number
}>

type QueuedFrame = Readonly<{
  frame: string
  bytes: number
}>

type Subscriber = {
  prefixEnd: number
  prefixIndex: number
  liveFrames: QueuedFrame[]
  liveHead: number
  liveBytes: number
  pendingPulls: number
  controller: ReadableStreamDefaultController<string> | undefined
  active: boolean
}

const DEFAULT_LIMITS: FeedLimits = Object.freeze({
  maxBytes: 1024 * 1024,
  maxFrames: 4096,
  maxSubscriberBytes: 256 * 1024,
})

const encoder = new TextEncoder()

const limit = (value: number | undefined, fallback: number, name: string): number => {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`)
  return value
}

const frameBytes = (frame: string): number => encoder.encode(frame).byteLength

export function createObservationFeed(options: FeedOptions = {}): {
  publish(frame: string): void
  subscribe(): ReadableStream<string> | null
  finish(): void
  close(): void
} {
  const limits: FeedLimits = Object.freeze({
    maxBytes: limit(options.maxBytes, DEFAULT_LIMITS.maxBytes, 'maxBytes'),
    maxFrames: limit(options.maxFrames, DEFAULT_LIMITS.maxFrames, 'maxFrames'),
    maxSubscriberBytes: limit(options.maxSubscriberBytes, DEFAULT_LIMITS.maxSubscriberBytes, 'maxSubscriberBytes'),
  })
  let state: FeedState = 'OPEN'
  let totalBytes = 0
  const frames: string[] = []
  const subscribers = new Set<Subscriber>()

  const removeSubscriber = (subscriber: Subscriber): void => {
    subscriber.active = false
    subscriber.pendingPulls = 0
    subscriber.liveFrames.length = 0
    subscriber.liveHead = 0
    subscriber.liveBytes = 0
    subscribers.delete(subscriber)
  }

  const terminateSubscriber = (subscriber: Subscriber, code?: string): void => {
    if (!subscriber.active) return
    const controller = subscriber.controller
    removeSubscriber(subscriber)
    if (!controller) return
    try {
      if (code) controller.error(new Error(code))
      else controller.close()
    } catch {
      // A reader can cancel between publication and termination. The feed remains safe.
    }
  }

  const compactLiveFrames = (subscriber: Subscriber): void => {
    if (subscriber.liveHead === subscriber.liveFrames.length) {
      subscriber.liveFrames.length = 0
      subscriber.liveHead = 0
      return
    }
    if (subscriber.liveHead >= 64 && subscriber.liveHead * 2 >= subscriber.liveFrames.length) {
      subscriber.liveFrames.splice(0, subscriber.liveHead)
      subscriber.liveHead = 0
    }
  }

  const nextFrame = (subscriber: Subscriber): string | null => {
    if (subscriber.prefixIndex < subscriber.prefixEnd) {
      const frame = frames[subscriber.prefixIndex]
      subscriber.prefixIndex += 1
      if (frame === undefined) return null
      return frame
    }
    const queued = subscriber.liveFrames[subscriber.liveHead]
    if (!queued) return null
    subscriber.liveHead += 1
    subscriber.liveBytes -= queued.bytes
    compactLiveFrames(subscriber)
    return queued.frame
  }

  const drain = (subscriber: Subscriber): void => {
    const controller = subscriber.controller
    if (!subscriber.active || !controller) return
    while (subscriber.pendingPulls > 0) {
      const next = nextFrame(subscriber)
      if (next === null) {
        if (state !== 'OPEN') {
          subscriber.pendingPulls = 0
          removeSubscriber(subscriber)
          try { controller.close() } catch { /* already canceled or closed */ }
        }
        return
      }
      subscriber.pendingPulls -= 1
      try {
        controller.enqueue(next)
      } catch {
        removeSubscriber(subscriber)
        return
      }
    }
  }

  const overflow = (): void => {
    if (state !== 'OPEN') return
    state = 'OVERFLOWED'
    frames.length = 0
    totalBytes = 0
    for (const subscriber of subscribers) terminateSubscriber(subscriber, 'OBSERVATION_FEED_OVERFLOW')
  }

  const offerLiveFrame = (subscriber: Subscriber, queued: QueuedFrame): void => {
    if (!subscriber.active) return

    // A pending reader can accept one frame directly, even if the frame is larger
    // than its retained live queue. This is not a slow-subscriber overflow.
    if (subscriber.pendingPulls > 0 && subscriber.liveBytes === 0 && subscriber.liveHead === subscriber.liveFrames.length) {
      subscriber.pendingPulls -= 1
      try { subscriber.controller?.enqueue(queued.frame) } catch { removeSubscriber(subscriber) }
      return
    }

    if (queued.bytes > limits.maxSubscriberBytes || subscriber.liveBytes > limits.maxSubscriberBytes - queued.bytes) {
      terminateSubscriber(subscriber, 'OBSERVATION_SUBSCRIBER_OVERFLOW')
      return
    }
    subscriber.liveFrames.push(queued)
    subscriber.liveBytes += queued.bytes
    drain(subscriber)
  }

  const subscribe = (): ReadableStream<string> | null => {
    if (state !== 'OPEN' && state !== 'FINISHED') return null
    if (subscribers.size >= 4) return null
    const subscriber: Subscriber = {
      prefixEnd: frames.length,
      prefixIndex: 0,
      liveFrames: [],
      liveHead: 0,
      liveBytes: 0,
      pendingPulls: 0,
      controller: undefined,
      active: true,
    }
    subscribers.add(subscriber)
    try {
      return new ReadableStream<string>({
        start: (controller) => { subscriber.controller = controller },
        pull: () => {
          if (!subscriber.active) return
          subscriber.pendingPulls += 1
          drain(subscriber)
        },
        cancel: () => { removeSubscriber(subscriber) },
      }, { highWaterMark: 0 })
    } catch (error) {
      removeSubscriber(subscriber)
      throw error
    }
  }

  return Object.freeze({
    publish: (frame: string): void => {
      if (state !== 'OPEN' || typeof frame !== 'string') return
      const bytes = frameBytes(frame)
      if (frames.length >= limits.maxFrames || bytes > limits.maxBytes - totalBytes) {
        overflow()
        return
      }
      frames.push(frame)
      totalBytes += bytes
      const queued = Object.freeze({ frame, bytes })
      for (const subscriber of subscribers) offerLiveFrame(subscriber, queued)
    },
    subscribe,
    finish: (): void => {
      if (state !== 'OPEN') return
      state = 'FINISHED'
      for (const subscriber of subscribers) drain(subscriber)
    },
    close: (): void => {
      if (state === 'CLOSED') return
      state = 'CLOSED'
      frames.length = 0
      totalBytes = 0
      for (const subscriber of subscribers) terminateSubscriber(subscriber)
    },
  })
}
