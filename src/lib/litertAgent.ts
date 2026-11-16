import {
  AutoToolChat,
  Backend,
  Engine,
  getOrLoadGlobalLiteRtLm,
  type JsonValue,
  type Message,
  type ToolWithImplementation,
} from '@litert-lm/core';
import type {
  AgentTrace,
  CatalogMatch,
  CatalogSearchResponse,
  PendingReservationIntent,
  SearchCatalogParams,
  ToolExecutionStep,
} from '../types/commerce.ts';
import type { StreamCallbacks } from './agentStream.ts';

export interface LiteRtModelPreset {
  id: string;
  label: string;
  uri: string;
  hint: string;
}

export const LITERT_MODEL_PRESETS: LiteRtModelPreset[] = [
  {
    id: 'gemma-4-e2b',
    label: 'Gemma 4 E2B (WebGPU)',
    uri: 'hf://litert-community/gemma-4-E2B-it-litert-lm',
    hint: 'Faster WebGPU download (~1.5 GB cached)',
  },
  {
    id: 'gemma-4-e4b',
    label: 'Gemma 4 E4B (WebGPU)',
    uri: 'hf://litert-community/gemma-4-E4B-it-litert-lm',
    hint: 'Higher tool accuracy (~2.8 GB cached)',
  },
];

const SYSTEM_INSTRUCTION = `You are a Copilot Agentic Commerce Assistant backed by a live Cloud Firestore Catalog Graph.
You MUST NEVER invent prices, store locations, inventory counts, or merchant policies.
Always call search_catalog first whenever the user asks about products, prices, dietary options, locations, or availability.
If the user asks to reserve, hold, or buy an item, call search_catalog first (if IDs are unknown) and then call reserve_offer on the eligible offer.
Pay strict attention to availability_status, merchant_controls.agent_checkout_allowed, and excluded_offers.
Keep your final response concise, accurate to the cent, and grounded strictly in the tool response.`;

let cachedEngine: Engine | null = null;
let cachedModelKey: string | null = null;
let activeToolChat: AutoToolChat | null = null;
let loadingPromise: Promise<Engine> | null = null;

export async function checkWebGpuSupport(): Promise<{ supported: boolean; reason?: string }> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return {
      supported: false,
      reason: 'WebGPU is not available in this browser. Switch to Cloud Gemini or use Chrome/Edge with WebGPU enabled.',
    };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      return {
        supported: false,
        reason: 'No WebGPU GPU adapter detected on this device. Switch to Cloud Gemini for server-side inference.',
      };
    }
    return { supported: true };
  } catch (err) {
    return {
      supported: false,
      reason: err instanceof Error ? err.message : 'Unable to access WebGPU adapter.',
    };
  }
}

export async function initLiteRtEngine(
  modelUri: string,
  accessToken?: string,
): Promise<Engine> {
  const normalizedUri = modelUri.trim();
  const modelKey = `${normalizedUri}::${accessToken ? 'auth' : 'anon'}`;

  if (cachedEngine && cachedModelKey === modelKey) {
    return cachedEngine;
  }

  if (loadingPromise && cachedModelKey === modelKey) {
    return loadingPromise;
  }

  const gpuCheck = await checkWebGpuSupport();
  if (!gpuCheck.supported) {
    throw new Error(gpuCheck.reason || 'WebGPU is unavailable.');
  }

  loadingPromise = (async () => {
    if (activeToolChat) {
      await activeToolChat.delete().catch(() => undefined);
      activeToolChat = null;
    }
    if (cachedEngine) {
      await cachedEngine.delete().catch(() => undefined);
      cachedEngine = null;
    }

    await getOrLoadGlobalLiteRtLm('/litertlm-wasm');

    const modelInput = accessToken?.trim()
      ? { url: normalizedUri, accessToken: accessToken.trim() }
      : normalizedUri;

    const engine = await Engine.create({
      model: modelInput,
      backend: Backend.GPU,
      mainExecutorSettings: {
        maxNumTokens: 8192,
      },
    });

    cachedEngine = engine;
    cachedModelKey = modelKey;
    return engine;
  })();

  try {
    return await loadingPromise;
  } catch (err) {
    cachedModelKey = null;
    throw err;
  } finally {
    loadingPromise = null;
  }
}

export async function resetLiteRtConversation(): Promise<void> {
  if (activeToolChat) {
    await activeToolChat.delete().catch(() => undefined);
    activeToolChat = null;
  }
}

export async function disposeLiteRtEngine(): Promise<void> {
  await resetLiteRtConversation();
  if (cachedEngine) {
    await cachedEngine.delete().catch(() => undefined);
    cachedEngine = null;
  }
  cachedModelKey = null;
}

function extractTextFromMessage(msg: Message): string {
  if (typeof msg.content === 'string') {
    return msg.content;
  }
  if (!Array.isArray(msg.content)) {
    return '';
  }
  return msg.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('');
}

function compactCatalogForEdgeKvCache(resp: CatalogSearchResponse): JsonValue {
  return {
    data_source: resp.data_source,
    matched_count: resp.matched_count,
    matches: resp.matches.slice(0, 6).map((m) => ({
      product_id: m.product.id,
      product_name: m.product.name,
      unit_size: m.product.unit_size,
      dietary_tags: m.product.dietary_tags,
      offer_id: m.offer.id,
      merchant_name: m.offer.merchant_name,
      location: m.offer.location,
      price: m.offer.price,
      availability_status: m.offer.availability_status,
      stock_count: m.offer.stock_count,
      agent_checkout_allowed: m.offer.merchant_controls.agent_checkout_allowed,
      max_quantity_per_order: m.offer.merchant_controls.max_quantity_per_order,
    })),
    excluded_offers: resp.excluded_offers.slice(0, 6).map((ex) => ({
      product_name: ex.product_name,
      merchant_name: ex.merchant_name,
      location: ex.location,
      price: ex.price,
      availability_status: ex.availability_status,
      agent_checkout_allowed: ex.agent_checkout_allowed,
      reasons: ex.reasons,
    })),
  };
}

interface ActiveTurnContext {
  startTime: number;
  traceId: string;
  trimmedPrompt: string;
  modelUri: string;
  steps: ToolExecutionStep[];
  matchedItems: CatalogMatch[];
  pendingReservation: PendingReservationIntent | null;
  lastDataSource: 'firestore_live' | 'seed_preview';
  callbacks: StreamCallbacks;
}

let currentTurn: ActiveTurnContext | null = null;

function buildCurrentTraceSnapshot(ctx: ActiveTurnContext, streaming: boolean): AgentTrace {
  const toolNames = ctx.steps.map((s) => s.tool_name);
  const toolCalled = toolNames.length > 0 ? toolNames.join(' -> ') : null;
  const latestStep = ctx.steps[ctx.steps.length - 1] ?? null;
  const combinedParams =
    ctx.steps.length <= 1
      ? (latestStep?.extracted_parameters ?? null)
      : Object.fromEntries(
          ctx.steps.map((s) => [`step_${s.step}_${s.tool_name}`, s.extracted_parameters]),
        );
  const combinedApiResponse =
    ctx.steps.length <= 1
      ? (latestStep?.api_response ?? null)
      : {
          steps: ctx.steps.map((s) => ({
            step: s.step,
            tool_name: s.tool_name,
            response: s.api_response,
          })),
        };
  const toolContextInjected =
    ctx.steps.length === 0
      ? 'No tool execution required for this turn.'
      : JSON.stringify(combinedApiResponse, null, 2);

  const shortModelName = ctx.modelUri.split('/').pop() || ctx.modelUri;

  return {
    id: ctx.traceId,
    timestamp: new Date(ctx.startTime).toISOString(),
    model: `litert-lm (${shortModelName} · WebGPU)`,
    user_prompt: ctx.trimmedPrompt,
    tool_called: toolCalled,
    tool_decision_summary: toolCalled
      ? `On-device LiteRT-LM executed ${ctx.steps.length} tool step${ctx.steps.length > 1 ? 's' : ''} (${toolCalled}) against ${ctx.lastDataSource === 'firestore_live' ? 'live Cloud Firestore' : 'Catalog Preview'} via WebGPU.`
      : 'On-device LiteRT-LM answered directly without invoking a catalog tool.',
    extracted_parameters: combinedParams,
    catalog_api_response: combinedApiResponse,
    steps: [...ctx.steps],
    final_grounded_prompt: {
      system_instruction: SYSTEM_INSTRUCTION,
      tool_context_injected: toolContextInjected,
      user_query: ctx.trimmedPrompt,
    },
    latency_ms: Date.now() - ctx.startTime,
    streaming,
  };
}

function createLiteRtTools(): ToolWithImplementation[] {
  return [
    {
      name: 'search_catalog',
      description:
        'Query the Firestore Commerce Catalog Graph using filters such as query keywords, max_price, must_be_in_stock, dietary_tags, location, and only_agent_checkout_allowed.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords matching product name, brand, or category.',
          },
          max_price: {
            type: 'number',
            description: 'Maximum unit price in USD.',
          },
          must_be_in_stock: {
            type: 'boolean',
            description: 'Exclude out_of_stock offers (defaults to true).',
          },
          dietary_tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dietary requirements such as ["vegan", "gluten-free"].',
          },
          location: {
            type: 'string',
            description: 'City or region filter such as "Mountain View".',
          },
          only_agent_checkout_allowed: {
            type: 'boolean',
            description: 'Set true if user requires AI agent checkout eligibility.',
          },
        },
      },
      execute: async (args) => {
        const ctx = currentTurn;
        if (!ctx) throw new Error('No active LiteRT turn context.');
        const stepStart = Date.now();
        const resp = await fetch('/api/catalog/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args as SearchCatalogParams),
        });
        if (!resp.ok) {
          throw new Error('Failed to query /api/catalog/search.');
        }
        const searchResult = (await resp.json()) as CatalogSearchResponse;
        ctx.lastDataSource = searchResult.data_source;
        ctx.matchedItems = searchResult.matches;
        ctx.steps.push({
          step: ctx.steps.length + 1,
          tool_name: 'search_catalog',
          extracted_parameters: args as Record<string, unknown>,
          api_response: searchResult,
          duration_ms: Date.now() - stepStart,
        });
        ctx.callbacks.onTraceUpdate?.({
          trace: buildCurrentTraceSnapshot(ctx, true),
          matches: ctx.matchedItems,
          pendingReservation: ctx.pendingReservation,
        });
        return compactCatalogForEdgeKvCache(searchResult);
      },
    },
    {
      name: 'reserve_offer',
      description:
        'Validate and prepare a reservation action for a specific product_id and offer_id returned by search_catalog.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'Canonical product ID.' },
          offer_id: { type: 'string', description: 'Merchant offer ID.' },
          quantity: { type: 'integer', description: 'Units to reserve (default 1).' },
        },
        required: ['product_id', 'offer_id'],
      },
      execute: async (args) => {
        const ctx = currentTurn;
        if (!ctx) throw new Error('No active LiteRT turn context.');
        const stepStart = Date.now();
        const resp = await fetch('/api/catalog/evaluate-reservation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        if (!resp.ok) {
          throw new Error('Failed to evaluate reservation policy.');
        }
        const evalResult = (await resp.json()) as {
          ok: boolean;
          intent: PendingReservationIntent | null;
          apiPayload: Record<string, unknown>;
        };
        ctx.pendingReservation = evalResult.intent;
        ctx.steps.push({
          step: ctx.steps.length + 1,
          tool_name: 'reserve_offer',
          extracted_parameters: args as Record<string, unknown>,
          api_response: evalResult.apiPayload,
          duration_ms: Date.now() - stepStart,
        });
        ctx.callbacks.onTraceUpdate?.({
          trace: buildCurrentTraceSnapshot(ctx, true),
          matches: ctx.matchedItems,
          pendingReservation: ctx.pendingReservation,
        });
        return evalResult.apiPayload as JsonValue;
      },
    },
  ];
}

export async function runLiteRtAgentChat(
  prompt: string,
  options: {
    modelUri: string;
    accessToken?: string;
  },
  callbacks: StreamCallbacks,
): Promise<void> {
  const startTime = Date.now();
  const trimmedPrompt = prompt.trim();
  const engine = await initLiteRtEngine(options.modelUri, options.accessToken);

  const turnCtx: ActiveTurnContext = {
    startTime,
    traceId: `trace_litert_${startTime}`,
    trimmedPrompt,
    modelUri: options.modelUri,
    steps: [],
    matchedItems: [],
    pendingReservation: null,
    lastDataSource: 'seed_preview',
    callbacks,
  };
  currentTurn = turnCtx;

  if (!activeToolChat) {
    activeToolChat = new AutoToolChat({
      engine,
      tools: createLiteRtTools(),
      recurringToolCallLimit: 4,
      config: {
        enableConstrainedDecoding: true,
        preface: {
          messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }],
        },
      },
    });
  }

  let fullReply = '';
  const stream = activeToolChat.sendMessageStreaming(trimmedPrompt);
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const piece = extractTextFromMessage(value);
        if (piece) {
          fullReply += piece;
          callbacks.onToken?.(piece);
        }
      }
    }
  } finally {
    reader.releaseLock();
    if (currentTurn === turnCtx) {
      currentTurn = null;
    }
  }

  callbacks.onDone?.({
    reply: fullReply,
    matches: turnCtx.matchedItems,
    pendingReservation: turnCtx.pendingReservation,
    trace: buildCurrentTraceSnapshot(turnCtx, false),
  });
}
