import { useState } from 'react';
import { Code2, Database, Cpu, Terminal, Play } from 'lucide-react';
import type { AgentTrace } from '../types/commerce.ts';
import { JsonHighlighter } from './JsonHighlighter.tsx';

interface TraceInspectorProps {
  trace: AgentTrace | null;
  isLoading: boolean;
  onRunSample: () => void;
}

type StageFilter = 'all' | 'tool' | 'params' | 'response' | 'prompt';

export function TraceInspector({ trace, isLoading, onRunSample }: TraceInspectorProps) {
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');

  const filterTabs: { id: StageFilter; label: string }[] = [
    { id: 'all', label: 'All Stages' },
    { id: 'tool', label: '01. Decision' },
    { id: 'params', label: '02. Params' },
    { id: 'response', label: '03. Firestore JSON' },
    { id: 'prompt', label: '04. Prompt' },
  ];

  return (
    <section
      aria-label="Under the Hood Developer Trace"
      className="flex flex-col h-full bg-slate-900 text-slate-100 border-t lg:border-t-0 lg:border-l border-slate-800 overflow-hidden"
    >
      {/* Inspector Toolbar */}
      <div className="px-5 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="font-display text-sm font-semibold text-slate-100 tracking-wide">
            Under the Hood Trace
          </h2>
          <p className="text-xs text-slate-400">
            Live LLM tool orchestration and Cloud Firestore Catalog API inspection
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-800/80 rounded-lg">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStageFilter(tab.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                stageFilter === tab.id
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inspector Body */}
      <div className="flex-1 overflow-y-auto dark-inspector-scroll p-5 space-y-5">
        {isLoading && (!trace || !trace.streaming) ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 space-y-2.5">
              <div className="h-4 w-48 bg-slate-700/70 rounded" />
              <div className="h-3 w-full bg-slate-800 rounded" />
              <div className="h-3 w-2/3 bg-slate-800 rounded" />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 space-y-2.5">
              <div className="h-4 w-56 bg-slate-700/70 rounded" />
              <div className="h-28 w-full bg-slate-950/80 rounded border border-slate-800" />
            </div>
          </div>
        ) : !trace ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
              <Terminal className="w-5 h-5 text-blue-400" aria-hidden="true" />
            </div>
            <h3 className="font-display text-base font-semibold text-slate-100 mb-2">
              Waiting for an Agentic Turn
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Send a natural-language query on the left to watch Cloud Gemini or Browser LiteRT-LM extract structured parameters, invoke the Firestore Catalog API, evaluate merchant controls, and construct a grounded prompt.
            </p>
            <button
              type="button"
              onClick={onRunSample}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Run Sample Query</span>
            </button>
          </div>
        ) : (
          <>
            {/* Trace Metadata Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="text-slate-200 font-medium">{trace.model}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {trace.streaming ? 'Streaming synthesis...' : `${trace.latency_ms} ms total`}
                </span>
              </div>
              <span className="font-mono-tabular">
                {new Date(trace.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {/* Stage 1: Tool Decision */}
            {(stageFilter === 'all' || stageFilter === 'tool') && (
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
                    <h3 className="font-display text-sm font-semibold text-slate-100">
                      01. LLM Tool Selection Decision
                    </h3>
                  </div>
                  <span className="font-mono-tabular text-xs font-medium text-blue-300">
                    {trace.tool_called ?? 'direct_reply'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed tracking-[0.01em]">
                  {trace.tool_decision_summary}
                </p>
                {trace.steps && trace.steps.length > 1 && (
                  <div className="pt-2 border-t border-slate-700/60 flex flex-wrap gap-3 text-[11px] font-mono-tabular text-slate-400">
                    {trace.steps.map((s) => (
                      <span key={s.step}>
                        Step {s.step}: {s.tool_name} ({s.duration_ms} ms)
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Stage 2: Extracted Parameters */}
            {(stageFilter === 'all' || stageFilter === 'params') && (
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    02. Extracted Tool Parameters
                  </h3>
                </div>
                <JsonHighlighter
                  data={trace.extracted_parameters ?? { note: 'No parameters extracted' }}
                  highlightKeys={['max_price', 'must_be_in_stock', 'location', 'dietary_tags', 'query', 'offer_id']}
                  maxHeightClass="max-h-56"
                />
              </div>
            )}

            {/* Stage 3: Raw Firestore Catalog API Response */}
            {(stageFilter === 'all' || stageFilter === 'response') && (
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                    <h3 className="font-display text-sm font-semibold text-slate-100">
                      03. Raw Firestore Catalog API Response
                    </h3>
                  </div>
                  {trace.catalog_api_response &&
                    'data_source' in trace.catalog_api_response && (
                      <span className="text-xs font-mono-tabular text-slate-400">
                        source: {String(trace.catalog_api_response.data_source)}
                      </span>
                    )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Highlights show live <span className="font-mono text-emerald-300">availability_status</span> and <span className="font-mono text-blue-300">merchant_controls</span> governance gates returned from the collectionGroup query.
                </p>
                <JsonHighlighter
                  data={trace.catalog_api_response ?? { note: 'No catalog API call made' }}
                  highlightKeys={[
                    'availability_status',
                    'merchant_controls',
                    'agent_checkout_allowed',
                    'excluded_offers',
                  ]}
                  maxHeightClass="max-h-[420px]"
                />
              </div>
            )}

            {/* Stage 4: Final Grounded Prompt */}
            {(stageFilter === 'all' || stageFilter === 'prompt') && (
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-sm font-semibold text-slate-100">
                    04. Final Grounded Synthesis Prompt
                  </h3>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="rounded-lg border border-slate-700/80 bg-slate-950 p-3 space-y-1">
                    <div className="font-medium text-slate-400">System Instruction</div>
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-slate-300">
                      {trace.final_grounded_prompt.system_instruction}
                    </pre>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-950 p-3 space-y-1">
                    <div className="font-medium text-slate-400">User Query</div>
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-blue-300">
                      {trace.final_grounded_prompt.user_query}
                    </pre>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-950 p-3 space-y-1">
                    <div className="font-medium text-slate-400">Injected Function Response Context</div>
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-5 text-slate-300 max-h-60 overflow-auto dark-inspector-scroll">
                      {trace.final_grounded_prompt.tool_context_injected}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
