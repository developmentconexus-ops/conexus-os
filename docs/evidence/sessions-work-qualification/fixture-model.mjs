// Deterministic fake LanguageModelV2 (AI SDK v5 provider spec, as re-exported by
// @mastra/core 1.67.0 at node_modules/@mastra/core/dist/_types/@ai-sdk_provider-v5).
// No network. Emits a scripted sequence of tool calls, then a final text message.
//
// Usage:
//   import { createScriptedModel } from './fixture-model.mjs';
//   const model = createScriptedModel(
//     [{ toolName: 'appendTool', args: { value: 'x' } }],
//     'done'
//   );
//   const agent = new Agent({ name: 'a', instructions: '...', model, tools: { appendTool } });

function partsToStream(parts) {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

/**
 * Scripts one agentic turn: first model call emits the tool calls (finish
 * reason 'tool-calls', which makes Mastra's agent loop execute them and feed
 * results back); every call after that emits only the final text (finish
 * reason 'stop', ending the loop). This mirrors a real provider, whose next
 * turn reflects the tool results already in the conversation instead of
 * re-emitting the same tool calls forever.
 *
 * @param {{toolName: string, args: object}[]} toolCalls
 * @param {string} finalText
 */
export function createScriptedModel(toolCalls = [], finalText = '') {
  let turn = 0;

  function buildTurn(turnIndex) {
    const isToolTurn = turnIndex === 0 && toolCalls.length > 0;
    if (isToolTurn) {
      return {
        content: toolCalls.map((tc, i) => ({
          type: 'tool-call',
          toolCallId: `call_${i}`,
          toolName: tc.toolName,
          input: JSON.stringify(tc.args ?? {}),
        })),
        finishReason: 'tool-calls',
      };
    }
    return {
      content: finalText ? [{ type: 'text', text: finalText }] : [],
      finishReason: 'stop',
    };
  }

  return {
    specificationVersion: 'v2',
    provider: 'fixture',
    modelId: 'scripted-model-1',
    supportedUrls: {},

    async doGenerate(_options) {
      const { content, finishReason } = buildTurn(turn);
      turn += 1;
      return {
        content,
        finishReason,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        warnings: [],
      };
    },

    async doStream(_options) {
      const { content, finishReason } = buildTurn(turn);
      turn += 1;
      const parts = [{ type: 'stream-start', warnings: [] }];

      for (const c of content) {
        if (c.type === 'tool-call') {
          parts.push({ type: 'tool-input-start', id: c.toolCallId, toolName: c.toolName });
          parts.push({ type: 'tool-input-delta', id: c.toolCallId, delta: c.input });
          parts.push({ type: 'tool-input-end', id: c.toolCallId });
          parts.push(c);
        } else if (c.type === 'text') {
          const textId = `text_${turn}`;
          parts.push({ type: 'text-start', id: textId });
          parts.push({ type: 'text-delta', id: textId, delta: c.text });
          parts.push({ type: 'text-end', id: textId });
        }
      }

      parts.push({
        type: 'finish',
        finishReason,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      });

      return {
        stream: partsToStream(parts),
      };
    },
  };
}
