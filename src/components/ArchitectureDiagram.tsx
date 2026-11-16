import { useState } from 'react';
import {
  ArrowDown,
  Cpu,
  Cloud,
  Database,
  Layers,
  ShieldCheck,
  Terminal,
  Code2,
} from 'lucide-react';

interface ArchitectureDiagramProps {
  title: string;
  lines: string[];
  caption?: string;
}

export function ArchitectureDiagram({
  title,
  lines,
  caption,
}: ArchitectureDiagramProps) {
  const [showAscii, setShowAscii] = useState(false);

  return (
    <figure className="my-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <Layers className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
          <span>{title}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowAscii((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors cursor-pointer"
        >
          <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{showAscii ? 'Visual Diagram' : 'ASCII View'}</span>
        </button>
      </div>

      {showAscii ? (
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-[11px] leading-relaxed font-mono text-slate-100">
          {lines.join('\n')}
        </pre>
      ) : (
        <div className="space-y-2.5">
          {/* Layer 1: Frontend Workbench */}
          <div className="rounded-lg border border-slate-300 bg-white p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                1. Frontend Workbench
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                React 19 · TypeScript · Vite 8 · Express :3000
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-900">
                  CopilotSimulator
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Consumer chat, Runtime Toggle, offer cards &amp; Reserve CTA
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-900">
                  TraceInspector
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  4-stage live SSE trace: decisions, params, raw API JSON, prompt
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold text-slate-900">
                  CatalogGraphView &amp; PRD
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  Live offer/policy editor, reservations &amp; Google Docs export
                </div>
              </div>
            </div>
          </div>

          {/* Connector 1 -> 2 */}
          <div className="flex flex-col items-center py-0.5 text-slate-400">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
              <ArrowDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Prompt + Model Runtime Toggle</span>
            </div>
          </div>

          {/* Layer 2: Hybrid Model Runtime Switch */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-950">
                  <Cloud className="w-3.5 h-3.5 text-blue-600 shrink-0" aria-hidden="true" />
                  <span>2A. Cloud Gemini Runtime</span>
                </div>
                <span className="font-mono text-[10px] text-blue-700">
                  Server-Side
                </span>
              </div>
              <div className="font-mono text-[11px] text-blue-900">
                POST /api/agent/chat/stream
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                <span className="font-mono">@google/genai</span> targeting{' '}
                <span className="font-mono">gemini-4-hydrogen</span> with{' '}
                <span className="font-mono">MAX_TOOL_HOPS = 4</span> and real-time SSE{' '}
                <span className="font-mono">trace_update</span> events.
              </p>
            </div>

            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-950">
                  <Cpu className="w-3.5 h-3.5 text-indigo-600 shrink-0" aria-hidden="true" />
                  <span>2B. Browser LiteRT-LM Runtime</span>
                </div>
                <span className="font-mono text-[10px] text-indigo-700">
                  On-Device WebGPU
                </span>
              </div>
              <div className="font-mono text-[11px] text-indigo-900">
                @litert-lm/core · /litertlm-wasm
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                <span className="font-mono">AutoToolChat</span> (Gemma 4 E2B / E4B) on{' '}
                <span className="font-mono">Backend.GPU</span> with constrained decoding &amp; 8K KV-cache compaction.
              </p>
            </div>
          </div>

          {/* Connector 2 -> 3 */}
          <div className="flex flex-col items-center py-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
              <ArrowDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>Shared Tool Calls: search_catalog &amp; reserve_offer</span>
            </div>
          </div>

          {/* Layer 3: Authoritative Tool & Policy Gate */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>3. Authoritative Tool &amp; Policy Gate (Express Backend)</span>
              </div>
              <span className="font-mono text-[11px] text-amber-800">
                server.ts
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
              <div className="rounded-md border border-amber-200/80 bg-white px-3 py-2">
                <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-900">
                  <Terminal className="w-3 h-3 text-amber-700" aria-hidden="true" />
                  <span>POST /api/catalog/search</span>
                </div>
                <p className="text-slate-600 mt-0.5">
                  Filters dietary tags, max_price, city &amp; stock; returns matches + excluded_offers reasons.
                </p>
              </div>
              <div className="rounded-md border border-amber-200/80 bg-white px-3 py-2">
                <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-900">
                  <Terminal className="w-3 h-3 text-amber-700" aria-hidden="true" />
                  <span>POST /api/catalog/evaluate-reservation</span>
                </div>
                <p className="text-slate-600 mt-0.5">
                  Enforces <span className="font-mono">agent_checkout_allowed</span>,{' '}
                  <span className="font-mono">max_quantity_per_order</span> &amp; live stock.
                </p>
              </div>
            </div>
          </div>

          {/* Connector 3 -> 4 */}
          <div className="flex flex-col items-center py-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
              <ArrowDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>O(1) Parallel Graph Reads &amp; Atomic runTransaction</span>
            </div>
          </div>

          {/* Layer 4: Data & Production Ingestion */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
                <Database className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>4. Cloud Firestore Product-Offer Graph &amp; Production Feed Pattern</span>
              </div>
              <span className="font-mono text-[11px] text-emerald-800">
                firestore.rules
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
              <div className="rounded-md border border-emerald-200/80 bg-white px-3 py-2 space-y-1">
                <div className="font-semibold text-slate-900">
                  Live Firestore Collections &amp; Atomic Write
                </div>
                <div className="text-slate-600 leading-relaxed">
                  <span className="font-mono">/products</span> (Canonical GTIN/specs) +{' '}
                  <span className="font-mono">collectionGroup(&apos;offers&apos;)</span> (price/stock/controls) +{' '}
                  <span className="font-mono">runTransaction</span> -&gt;{' '}
                  <span className="font-mono">/reservations</span>
                </div>
              </div>
              <div className="rounded-md border border-emerald-200/80 bg-white px-3 py-2 space-y-1">
                <div className="font-semibold text-slate-900">
                  Google &amp; Microsoft Scale Ingestion Mirror
                </div>
                <div className="text-slate-600 leading-relaxed">
                  Batch Feeds · Sub-Minute Push APIs · 15–60m Local POS Sync ·{' '}
                  <span className="font-mono">Schema.org</span> Crawl -&gt; Entity Linking &amp; Spot Checks
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {caption && (
        <figcaption className="text-[11px] text-slate-500 leading-relaxed pt-1">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
