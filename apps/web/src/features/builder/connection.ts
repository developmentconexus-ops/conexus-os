// Adapted from Mastra's Factory UI (mastracode/factory-ui/src/ui/domains/chat/hooks/useAgentControllerEvents.ts
// and src/ui/lib/hooks/useDocumentVisible.ts, https://github.com/mastra-ai/mastra), licensed under the
// Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0); see the repository's
// LICENSE.md. The shared subscription, the epoch retry and the hidden-tab drop are Mastra's. Changed:
// a subscription is keyed by the conversation, not the client object, and its state can be read by
// a screen that does not subscribe.

import type { AgentControllerEvent } from '@mastra/client-js'
import { useEffect, useRef, useSyncExternalStore } from 'react'

/** A stream that has not opened yet, is open, or was open and dropped. */
export type StreamState = 'never' | 'connected' | 'dropped'

type Stream = Readonly<{
  subscribe(options: Readonly<{ onEvent: (event: AgentControllerEvent) => void; onError: (error: unknown) => void }>): Promise<Readonly<{ unsubscribe: () => void }>>
}>

type SharedSubscription = {
  state: StreamState
  connecting: boolean
  eventListeners: Set<(event: AgentControllerEvent) => void>
  stateListeners: Set<(state: StreamState, previous: StreamState) => void>
  unsubscribe?: () => void
  teardown?: ReturnType<typeof setTimeout>
  disposed?: boolean
}

const subscriptions = new Map<string, SharedSubscription>()
const watchers = new Map<string, Set<() => void>>()

const notifyWatchers = (key: string): void => {
  for (const watcher of watchers.get(key) ?? []) watcher()
}

const setState = (key: string, subscription: SharedSubscription, state: StreamState): void => {
  if (subscription.state === state) return
  const previous = subscription.state
  subscription.state = state
  for (const listener of subscription.stateListeners) listener(state, previous)
  notifyWatchers(key)
}

/**
 * Starts a stream unless one is open or opening. Each epoch calls this again, which is what retries
 * a stream that dropped or never opened; an open or opening one is never torn down by an epoch, or a
 * poll that runs while the stream is down would cancel every attempt to bring it up.
 */
const ensureConnected = (key: string, open: () => Stream, subscription: SharedSubscription): void => {
  if (subscription.connecting || subscription.state === 'connected') return
  subscription.unsubscribe?.()
  delete subscription.unsubscribe
  subscription.connecting = true
  open().subscribe({
    onEvent: (event) => {
      for (const listener of subscription.eventListeners) listener(event)
    },
    onError: () => {
      if (subscription.state === 'connected') setState(key, subscription, 'dropped')
    },
  }).then(
    (opened) => {
      subscription.connecting = false
      if (subscription.disposed) return opened.unsubscribe()
      subscription.unsubscribe = opened.unsubscribe
      setState(key, subscription, 'connected')
    },
    () => {
      subscription.connecting = false
      if (subscription.state === 'connected') setState(key, subscription, 'dropped')
    },
  )
}

const getSubscription = (key: string): SharedSubscription => {
  let subscription = subscriptions.get(key)
  if (!subscription) {
    subscription = { state: 'never', connecting: false, eventListeners: new Set(), stateListeners: new Set() }
    subscriptions.set(key, subscription)
  }
  if (subscription.teardown) {
    clearTimeout(subscription.teardown)
    delete subscription.teardown
  }
  return subscription
}

const subscribeToVisibility = (onChange: () => void): (() => void) => {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

// A hidden tab holds no stream: browsers cap a host at six HTTP/1.1 connections, so a few background
// tabs would starve every other request. Showing the tab again opens it and resyncs like a reconnect.
const useDocumentVisible = (): boolean => useSyncExternalStore(subscribeToVisibility, () => document.visibilityState === 'visible')

/** The state of the stream under `key`, for a screen that only needs to know whether it is open. */
export const useStreamState = (key: string): StreamState => useSyncExternalStore(
  (onChange) => {
    const set = watchers.get(key) ?? new Set()
    watchers.set(key, set)
    set.add(onChange)
    return () => { set.delete(onChange) }
  },
  () => subscriptions.get(key)?.state ?? 'never',
)

/**
 * Follows the stream under `key` while the tab is visible, from the first nonzero `epoch` on, with
 * one subscription however many components follow it. Each new epoch retries a stream that is down.
 */
export const useSessionStream = ({ key, open, epoch, onEvent, onStateChange }: Readonly<{
  key: string
  open: () => Stream
  epoch: number
  onEvent: (event: AgentControllerEvent) => void
  onStateChange: (state: StreamState, previous: StreamState) => void
}>): void => {
  const visible = useDocumentVisible()
  const onEventRef = useRef(onEvent)
  const onStateChangeRef = useRef(onStateChange)
  const openRef = useRef(open)
  onEventRef.current = onEvent
  onStateChangeRef.current = onStateChange
  openRef.current = open

  useEffect(() => {
    if (!epoch || !visible) return undefined
    const subscription = getSubscription(key)
    const handleEvent = (event: AgentControllerEvent): void => onEventRef.current(event)
    const handleState = (state: StreamState, previous: StreamState): void => onStateChangeRef.current(state, previous)
    subscription.eventListeners.add(handleEvent)
    subscription.stateListeners.add(handleState)
    ensureConnected(key, () => openRef.current(), subscription)
    return () => {
      subscription.eventListeners.delete(handleEvent)
      subscription.stateListeners.delete(handleState)
      if (subscription.eventListeners.size > 0 || subscription.stateListeners.size > 0) return
      subscription.teardown = setTimeout(() => {
        if (subscription.eventListeners.size > 0 || subscription.stateListeners.size > 0) return
        subscription.disposed = true
        subscription.unsubscribe?.()
        subscriptions.delete(key)
        notifyWatchers(key)
      }, 0)
    }
  }, [epoch, key, visible])
}
