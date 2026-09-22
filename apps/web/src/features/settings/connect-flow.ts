// The "Conectar conta" flow, as one state machine instead of a pile of booleans: which provider,
// which method, and which step of that method is showing.
export type ConnectState =
  | { step: 'choose-provider' }
  | { step: 'choose-method'; provider: string }
  | { step: 'api-key'; provider: string }
  | { step: 'paste-code'; provider: string; sessionId: string; url: string }
  | { step: 'device-code'; provider: string; sessionId: string; url: string; userCode: string; nextPollMs: number }
  | { step: 'done'; provider: string }
  | { step: 'failed'; provider: string; message: string }

export type ConnectAction =
  | { type: 'provider-chosen'; provider: string }
  | { type: 'method-api-key' }
  | { type: 'method-paste-code'; sessionId: string; url: string }
  | { type: 'method-device-code'; sessionId: string; url: string; userCode: string; nextPollMs: number }
  | { type: 'succeeded' }
  | { type: 'failed'; message: string }
  | { type: 'reset' }

export const initialConnectState: ConnectState = { step: 'choose-provider' }

const providerOf = (state: ConnectState): string | null => 'provider' in state ? state.provider : null

export function connectFlowReducer(state: ConnectState, action: ConnectAction): ConnectState {
  switch (action.type) {
    case 'provider-chosen':
      return { step: 'choose-method', provider: action.provider }
    case 'method-api-key': {
      const provider = providerOf(state)
      return provider ? { step: 'api-key', provider } : state
    }
    case 'method-paste-code': {
      const provider = providerOf(state)
      return provider ? { step: 'paste-code', provider, sessionId: action.sessionId, url: action.url } : state
    }
    case 'method-device-code': {
      const provider = providerOf(state)
      return provider
        ? { step: 'device-code', provider, sessionId: action.sessionId, url: action.url, userCode: action.userCode, nextPollMs: action.nextPollMs }
        : state
    }
    case 'succeeded': {
      const provider = providerOf(state)
      return provider ? { step: 'done', provider } : state
    }
    case 'failed': {
      const provider = providerOf(state)
      return provider ? { step: 'failed', provider, message: action.message } : state
    }
    case 'reset':
      return initialConnectState
    default:
      return state
  }
}
