import { useRef, useState, useEffect, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  Send,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  Database,
  ArrowUpRight,
  Cloud,
  Cpu,
} from 'lucide-react';
import { streamAgentChat } from '../lib/agentStream.ts';
import {
  LITERT_MODEL_PRESETS,
  resetLiteRtConversation,
  runLiteRtAgentChat,
} from '../lib/litertAgent.ts';
import type {
  CatalogMatch,
  ChatMessage,
  LiteRtEngineStatus,
  ModelRuntime,
  Reservation,
} from '../types/commerce.ts';

interface CopilotSimulatorProps {
  user: User | null;
  isLiveSeeded: boolean;
  seeding: boolean;
  reservations: Reservation[];
  onSeedCatalog: () => Promise<void>;
  onSignIn: () => Promise<User | null>;
  onReserveOffer: (match: CatalogMatch) => Promise<Reservation>;
  onOpenCatalogTab: () => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  selectedTraceId: string | null;
  setSelectedTraceId: React.Dispatch<React.SetStateAction<string | null>>;
  sending: boolean;
  setSending: React.Dispatch<React.SetStateAction<boolean>>;
  runtime: ModelRuntime;
  onChangeRuntime: (next: ModelRuntime) => void;
  litertModelUri: string;
  onChangeLitertModelUri: (uri: string) => void;
  litertToken: string;
  onChangeLitertToken: (token: string) => void;
  litertStatus: LiteRtEngineStatus;
  litertError: string | null;
  onInitLitert: () => Promise<void>;
  onLitertStatusChange: (status: LiteRtEngineStatus, error?: string | null) => void;
}

const SCENARIO_PRESETS = [
  'Get me Kite Hill yogurt under $6 in Mountain View',
  'Find vegan snacks under $8 allowing AI checkout',
  'Reserve the cheapest Kite Hill yogurt in Mountain View',
  'Compare Kite Hill yogurt prices across all locations',
];

export function CopilotSimulator({
  user,
  isLiveSeeded,
  seeding,
  reservations,
  onSeedCatalog,
  onSignIn,
  onReserveOffer,
  onOpenCatalogTab,
  messages,
  setMessages,
  selectedTraceId,
  setSelectedTraceId,
  sending,
  setSending,
  runtime,
  onChangeRuntime,
  litertModelUri,
  onChangeLitertModelUri,
  litertToken,
  onChangeLitertToken,
  litertStatus,
  litertError,
  onInitLitert,
  onLitertStatusChange,
}: CopilotSimulatorProps) {
  const [input, setInput] = useState('');
  const [reservingOfferId, setReservingOfferId] = useState<string | null>(null);
  const [reservedByOfferId, setReservedByOfferId] = useState<Record<string, Reservation>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [useCustomUri, setUseCustomUri] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const activeReservationForOffer = (offerId: string): Reservation | undefined => {
    return (
      reservedByOfferId[offerId] ??
      reservations.find((r) => r.offerId === offerId && r.status === 'reserved')
    );
  };

  const sendPrompt = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;

    setActionError(null);
    const now = Date.now();
    const userMsg: ChatMessage = {
      id: `msg_u_${now}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    const assistantId = `msg_a_${now}`;
    const streamingMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    const nextHistory = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg, streamingMsg]);
    setInput('');
    setSending(true);

    const callbacks = {
      onTraceUpdate: ({
        trace,
        matches,
        pendingReservation,
      }: Parameters<NonNullable<Parameters<typeof streamAgentChat>[2]['onTraceUpdate']>>[0]) => {
        setSelectedTraceId(trace.id);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, trace, matches, pendingReservation }
              : m,
          ),
        );
      },
      onToken: (chunk: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `${m.content}${chunk}` }
              : m,
          ),
        );
      },
      onDone: ({
        reply,
        matches,
        pendingReservation,
        trace,
      }: Parameters<NonNullable<Parameters<typeof streamAgentChat>[2]['onDone']>>[0]) => {
        setSelectedTraceId(trace.id);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: reply || m.content || 'No response returned from the model.',
                  matches,
                  pendingReservation,
                  trace,
                }
              : m,
          ),
        );
      },
    };

    try {
      if (runtime === 'browser_litert') {
        if (litertStatus !== 'ready') {
          onLitertStatusChange('loading', null);
        }
        await runLiteRtAgentChat(
          trimmed,
          { modelUri: litertModelUri, accessToken: litertToken || undefined },
          callbacks,
        );
        onLitertStatusChange('ready', null);
      } else {
        await streamAgentChat(trimmed, nextHistory, callbacks);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unable to reach agent service.';
      if (runtime === 'browser_litert') {
        onLitertStatusChange('error', errMsg);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  runtime === 'browser_litert'
                    ? 'Browser LiteRT-LM runtime encountered an error.'
                    : 'The agent orchestration request encountered an error.',
                error: errMsg,
              }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendPrompt(input);
  };

  const handleReserveClick = async (match: CatalogMatch) => {
    setActionError(null);
    let activeUser = user;
    if (!activeUser) {
      try {
        activeUser = await onSignIn();
      } catch {
        setActionError('Google Sign-In is required to persist reservations in Firestore.');
        return;
      }
    }
    if (!activeUser) return;

    setReservingOfferId(match.offer.id);
    try {
      const reservation = await onReserveOffer(match);
      setReservedByOfferId((prev) => ({
        ...prev,
        [match.offer.id]: reservation,
      }));
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Failed to create reservation in Firestore.',
      );
    } finally {
      setReservingOfferId(null);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setSelectedTraceId(null);
    setReservedByOfferId({});
    setActionError(null);
    void resetLiteRtConversation();
  };

  const matchedPreset = LITERT_MODEL_PRESETS.find((p) => p.uri === litertModelUri);

  return (
    <section
      aria-label="Copilot User Experience"
      className="flex flex-col h-full bg-white text-slate-900 overflow-hidden"
    >
      {/* Left Pane Utility Header */}
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Database className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
          <span className="font-medium text-slate-800">
            {isLiveSeeded ? 'Live Cloud Firestore' : 'Preview Catalog'}
          </span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={onOpenCatalogTab}
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
          >
            <span>Edit Offers</span>
            <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Model Runtime Toggle */}
          <div
            role="group"
            aria-label="Model Runtime"
            className="inline-flex items-center p-0.5 bg-slate-200/80 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              disabled={sending}
              onClick={() => onChangeRuntime('cloud_gemini')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                runtime === 'cloud_gemini'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cloud className="w-3 h-3 text-blue-600 shrink-0" aria-hidden="true" />
              <span>Cloud Gemini</span>
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => onChangeRuntime('browser_litert')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                runtime === 'browser_litert'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Cpu className="w-3 h-3 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>Browser LiteRT-LM</span>
            </button>
          </div>

          {!isLiveSeeded && user && (
            <button
              type="button"
              onClick={() => void onSeedCatalog()}
              disabled={seeding}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {seeding ? 'Seeding...' : 'Seed Live Firestore'}
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Browser LiteRT-LM Configuration Strip */}
      {runtime === 'browser_litert' && (
        <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50 space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <label htmlFor="litert-model-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                WebGPU Model:
              </label>
              <select
                id="litert-model-select"
                value={useCustomUri || !matchedPreset ? 'custom' : matchedPreset.uri}
                disabled={litertStatus === 'loading' || sending}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'custom') {
                    setUseCustomUri(true);
                  } else {
                    setUseCustomUri(false);
                    onChangeLitertModelUri(val);
                  }
                }}
                className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
              >
                {LITERT_MODEL_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.uri}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom .litertlm URL / HF URI</option>
              </select>

              <button
                type="button"
                onClick={() => setShowTokenInput((prev) => !prev)}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-800 underline cursor-pointer"
              >
                {showTokenInput ? 'Hide HF Token' : 'HF Token (Optional)'}
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              <span
                className={`text-xs font-medium ${
                  litertStatus === 'ready'
                    ? 'text-emerald-700'
                    : litertStatus === 'error'
                      ? 'text-rose-700'
                      : 'text-slate-600'
                }`}
              >
                {litertStatus === 'ready'
                  ? 'WebGPU Ready (On-Device)'
                  : litertStatus === 'loading'
                    ? 'Downloading & Compiling WebGPU...'
                    : litertStatus === 'error'
                      ? 'WebGPU Unavailable / Load Error'
                      : 'Not Loaded (Loads on first turn)'}
              </span>
              <button
                type="button"
                disabled={litertStatus === 'loading' || sending}
                onClick={() => void onInitLitert()}
                className="px-2.5 py-1 text-xs font-medium text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
              >
                {litertStatus === 'loading'
                  ? 'Loading...'
                  : litertStatus === 'ready'
                    ? 'Reload Model'
                    : 'Preload Model'}
              </button>
            </div>
          </div>

          {(useCustomUri || !matchedPreset || showTokenInput) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {(useCustomUri || !matchedPreset) && (
                <input
                  type="text"
                  value={litertModelUri}
                  onChange={(e) => onChangeLitertModelUri(e.target.value)}
                  placeholder="hf://org/repo or https://.../model.litertlm"
                  className="flex-1 min-w-[220px] px-2.5 py-1 text-xs font-mono text-slate-800 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              )}
              {showTokenInput && (
                <input
                  type="password"
                  value={litertToken}
                  onChange={(e) => onChangeLitertToken(e.target.value)}
                  placeholder="Hugging Face access token (for gated models)"
                  className="flex-1 min-w-[200px] px-2.5 py-1 text-xs text-slate-800 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              )}
            </div>
          )}

          {litertError && (
            <div className="text-[11px] text-rose-700 leading-snug">
              {litertError}
            </div>
          )}
          {!litertError && matchedPreset && (
            <div className="text-[11px] text-slate-500 leading-snug">
              Runs locally in your browser via <span className="font-mono text-slate-700">@litert-lm/core</span> WebGPU ({matchedPreset.hint}); tool calls hit <span className="font-mono text-slate-700">/api/catalog/*</span> so Firestore &amp; merchant controls remain server-authoritative.
            </div>
          )}
        </div>
      )}

      {/* Scenario Preset Strip */}
      <div className="px-5 py-2.5 border-b border-slate-200 bg-white flex items-center gap-2 overflow-x-auto shrink-0">
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
          Demo Prompts:
        </span>
        {SCENARIO_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={sending}
            onClick={() => void sendPrompt(preset)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Conversation Thread */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center max-w-lg mx-auto py-8">
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 mb-3 text-balance">
              Copilot Commerce Action Engine
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Instead of a static product grid, this assistant translates natural-language shopping constraints into structured queries against a Cloud Firestore <span className="font-mono text-xs text-slate-800">products</span> and <span className="font-mono text-xs text-slate-800">offers</span> graph, respecting live inventory and <span className="font-mono text-xs text-slate-800">merchant_controls</span>.
            </p>
            <div className="border-t border-slate-200 pt-5 space-y-3">
              <div className="text-xs font-medium text-slate-500">
                Try the primary interview walkthrough prompt:
              </div>
              <button
                type="button"
                onClick={() => void sendPrompt(SCENARIO_PRESETS[0])}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer flex items-center justify-between gap-4"
              >
                <span className="text-sm font-medium text-slate-900">
                  &ldquo;{SCENARIO_PRESETS[0]}&rdquo;
                </span>
                <span className="text-xs font-medium text-blue-600 whitespace-nowrap shrink-0">
                  Run Prompt
                </span>
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl bg-slate-100 border border-slate-200 px-4 py-3 text-sm text-slate-900">
                    {msg.content}
                  </div>
                </div>
              );
            }

            const isTraceSelected = msg.trace?.id === selectedTraceId;

            return (
              <div
                key={msg.id}
                onClick={() => {
                  if (msg.trace) setSelectedTraceId(msg.trace.id);
                }}
                className={`rounded-xl border p-4 transition-colors space-y-4 ${
                  msg.trace ? 'cursor-pointer' : ''
                } ${
                  isTraceSelected
                    ? 'border-blue-600/60 bg-blue-50/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">Commerce Copilot</span>
                    {msg.trace?.tool_called && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular text-slate-600">
                          tool: {msg.trace.tool_called}
                        </span>
                      </>
                    )}
                  </div>
                  {msg.trace && (
                    <span className="text-blue-600 font-medium">
                      {isTraceSelected ? 'Inspecting Trace' : 'Inspect Trace'}
                    </span>
                  )}
                </div>

                {msg.error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                    {msg.error}
                  </div>
                ) : (
                  <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </div>
                )}

                {/* Grounded Actionable Offer Results */}
                {msg.matches && msg.matches.length > 0 && (
                  <div className="border-t border-slate-200 pt-3 space-y-2.5">
                    <div className="text-xs font-medium text-slate-500">
                      Grounded Merchant Offers ({msg.matches.length})
                    </div>
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white overflow-hidden">
                      {msg.matches.map((match) => {
                        const { product, offer } = match;
                        const reserved = activeReservationForOffer(offer.id);
                        const isInStock = offer.availability_status !== 'out_of_stock';
                        const agentAllowed = offer.merchant_controls.agent_checkout_allowed;
                        const canReserve = isInStock && agentAllowed;

                        const stockLabel =
                          offer.availability_status === 'in_stock'
                            ? `In Stock (${offer.stock_count})`
                            : offer.availability_status === 'low_stock'
                              ? `Low Stock (${offer.stock_count})`
                              : 'Out of Stock';

                        const stockColorClass =
                          offer.availability_status === 'in_stock'
                            ? 'text-emerald-700'
                            : offer.availability_status === 'low_stock'
                              ? 'text-amber-700'
                              : 'text-rose-700';

                        return (
                          <div
                            key={offer.id}
                            className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="text-sm font-semibold text-slate-900 truncate">
                                {product.name}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">
                                  {offer.merchant_name}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{offer.location}</span>
                                <span aria-hidden="true">·</span>
                                <span className={`font-medium ${stockColorClass}`}>
                                  {stockLabel}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    agentAllowed ? 'text-slate-600' : 'text-rose-700 font-medium'
                                  }
                                >
                                  {agentAllowed
                                    ? 'Agent Checkout Allowed'
                                    : 'Checkout Blocked by Merchant'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="font-mono-tabular text-sm font-semibold text-slate-900">
                                ${offer.price.toFixed(2)}
                              </span>

                              {reserved ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
                                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Reserved</span>
                                </span>
                              ) : canReserve ? (
                                <button
                                  type="button"
                                  disabled={reservingOfferId === offer.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleReserveClick(match);
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  {reservingOfferId === offer.id
                                    ? 'Reserving...'
                                    : user
                                      ? 'Reserve Pickup'
                                      : 'Sign In & Reserve'}
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
                                  <ShieldAlert className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                                  <span>Policy Restricted</span>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Pending Reservation Summary from reserve_offer tool */}
                {msg.pendingReservation && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-semibold text-slate-900">
                        Action Gate ({msg.pendingReservation.allowed ? 'Authorized' : 'Blocked'}):
                      </span>{' '}
                      {msg.pendingReservation.allowed
                        ? `${msg.pendingReservation.productName} at ${msg.pendingReservation.merchantName} ($${msg.pendingReservation.price.toFixed(2)}) passed merchant_controls verification.`
                        : msg.pendingReservation.reason}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {sending && messages[messages.length - 1]?.content === '' && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
            <div className="h-3.5 w-32 bg-slate-200 rounded" />
            <div className="h-3 w-full bg-slate-100 rounded" />
            <div className="h-3 w-3/4 bg-slate-100 rounded" />
          </div>
        )}

        {actionError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
            {actionError}
          </div>
        )}

        <div ref={scrollEndRef} />
      </div>

      {/* Chat Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-slate-200 bg-white shrink-0"
      >
        <div className="flex items-center gap-2.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Copilot (e.g., Get me Kite Hill yogurt under $6 in Mountain View)..."
            disabled={sending}
            className="flex-1 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white transition-colors"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            <span>Send</span>
          </button>
        </div>
      </form>
    </section>
  );
}
