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
    <figure className="my-4 rounded-2xl border border-[#dadce0] bg-[#f8fafd] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#dadce0]">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1f1f1f]">
          <Layers className="w-4 h-4 text-[#1a73e8] shrink-0" aria-hidden="true" />
          <span>{title}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowAscii((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-[#1f1f1f] bg-white hover:bg-[#f0f4f9] border border-[#dadce0] rounded-full transition-colors cursor-pointer"
        >
          <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{showAscii ? 'Visual Diagram' : 'ASCII View'}</span>
        </button>
      </div>

      {showAscii ? (
        <pre className="overflow-x-auto rounded-xl border border-[#303134] bg-[#131314] p-4 text-[11px] leading-relaxed font-mono text-[#e3e3e3]">
          {lines.join('\n')}
        </pre>
      ) : (
        <div className="space-y-2.5">
          {/* Layer 1: Frontend Workbench */}
          <div className="rounded-xl border border-[#dadce0] bg-white p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#1f1f1f]">
                1. Frontend Workbench
              </span>
              <span className="font-mono text-[11px] text-[#5f6368]">
                React 19 · TypeScript · Vite 8 · Express :3000
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="rounded-lg border border-[#dadce0] bg-[#f8fafd] px-3 py-2">
                <div className="text-xs font-semibold text-[#1f1f1f]">
                  CopilotSimulator
                </div>
                <div className="text-[11px] text-[#444746] mt-0.5">
                  Consumer chat, Runtime Toggle, offer cards &amp; Reserve CTA
                </div>
              </div>
              <div className="rounded-lg border border-[#dadce0] bg-[#f8fafd] px-3 py-2">
                <div className="text-xs font-semibold text-[#1f1f1f]">
                  TraceInspector
                </div>
                <div className="text-[11px] text-[#444746] mt-0.5">
                  4-stage live SSE trace: decisions, params, raw API JSON, prompt
                </div>
              </div>
              <div className="rounded-lg border border-[#dadce0] bg-[#f8fafd] px-3 py-2">
                <div className="text-xs font-semibold text-[#1f1f1f]">
                  CatalogGraphView &amp; PRD
                </div>
                <div className="text-[11px] text-[#444746] mt-0.5">
                  Live offer/policy editor, reservations &amp; Google Docs export
                </div>
              </div>
            </div>
          </div>

          {/* Connector 1 -> 2 */}
          <div className="flex flex-col items-center py-0.5 text-[#5f6368]">
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <ArrowDown className="w-3.5 h-3.5 text-[#747775]" aria-hidden="true" />
              <span>Prompt + Model Runtime Toggle</span>
            </div>
          </div>

          {/* Layer 2: Hybrid Model Runtime Switch */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#d2e3fc] bg-[#e8f0fe]/60 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0842a0]">
                  <Cloud className="w-3.5 h-3.5 text-[#1a73e8] shrink-0" aria-hidden="true" />
                  <span>2A. Cloud Gemini Runtime</span>
                </div>
                <span className="font-mono text-[10px] text-[#1a73e8]">
                  Server-Side
                </span>
              </div>
              <div className="font-mono text-[11px] text-[#0b57d0]">
                POST /api/agent/chat/stream
              </div>
              <p className="text-[11px] text-[#444746] leading-relaxed">
                <span className="font-mono">@google/genai</span> targeting{' '}
                <span className="font-mono">gemini-4-hydrogen</span> with{' '}
                <span className="font-mono">MAX_TOOL_HOPS = 4</span> and real-time SSE{' '}
                <span className="font-mono">trace_update</span> events.
              </p>
            </div>

            <div className="rounded-xl border border-[#ceead6] bg-[#e6f4ea]/60 p-3.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0d652d]">
                  <Cpu className="w-3.5 h-3.5 text-[#1e8e3e] shrink-0" aria-hidden="true" />
                  <span>2B. Browser LiteRT-LM Runtime</span>
                </div>
                <span className="font-mono text-[10px] text-[#1e8e3e]">
                  On-Device WebGPU
                </span>
              </div>
              <div className="font-mono text-[11px] text-[#137333]">
                @litert-lm/core · /litertlm-wasm
              </div>
              <p className="text-[11px] text-[#444746] leading-relaxed">
                <span className="font-mono">AutoToolChat</span> (Gemma 4 E2B / E4B) on{' '}
                <span className="font-mono">Backend.GPU</span> with constrained decoding &amp; 8K KV-cache compaction.
              </p>
            </div>
          </div>

          {/* Connector 2 -> 3 */}
          <div className="flex flex-col items-center py-0.5 text-[#5f6368]">
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <ArrowDown className="w-3.5 h-3.5 text-[#747775]" aria-hidden="true" />
              <span>Shared Tool Calls: search_catalog &amp; reserve_offer</span>
            </div>
          </div>

          {/* Layer 3: Authoritative Tool & Policy Gate */}
          <div className="rounded-xl border border-[#feefc3] bg-[#fef7e0]/60 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#b06000]">
                <ShieldCheck className="w-4 h-4 text-[#b06000] shrink-0" aria-hidden="true" />
                <span>3. Authoritative Tool &amp; Policy Gate (Express Backend)</span>
              </div>
              <span className="font-mono text-[11px] text-[#b06000]">
                server.ts
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
              <div className="rounded-lg border border-[#dadce0] bg-white px-3 py-2">
                <div className="flex items-center gap-1.5 font-mono font-semibold text-[#1f1f1f]">
                  <Terminal className="w-3 h-3 text-[#b06000]" aria-hidden="true" />
                  <span>POST /api/catalog/search</span>
                </div>
                <p className="text-[#444746] mt-0.5">
                  Filters dietary tags, max_price, city &amp; stock; returns matches + excluded_offers reasons.
                </p>
              </div>
              <div className="rounded-lg border border-[#dadce0] bg-white px-3 py-2">
                <div className="flex items-center gap-1.5 font-mono font-semibold text-[#1f1f1f]">
                  <Terminal className="w-3 h-3 text-[#b06000]" aria-hidden="true" />
                  <span>POST /api/catalog/evaluate-reservation</span>
                </div>
                <p className="text-[#444746] mt-0.5">
                  Enforces <span className="font-mono">agent_checkout_allowed</span>,{' '}
                  <span className="font-mono">max_quantity_per_order</span> &amp; live stock.
                </p>
              </div>
            </div>
          </div>

          {/* Connector 3 -> 4 */}
          <div className="flex flex-col items-center py-0.5 text-[#5f6368]">
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <ArrowDown className="w-3.5 h-3.5 text-[#747775]" aria-hidden="true" />
              <span>O(1) Parallel Graph Reads &amp; Atomic runTransaction</span>
            </div>
          </div>

          {/* Layer 4: Data & Production Ingestion */}
          <div className="rounded-xl border border-[#dadce0] bg-white p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1f1f1f]">
                <Database className="w-4 h-4 text-[#1e8e3e] shrink-0" aria-hidden="true" />
                <span>4. Cloud Firestore Product-Offer Graph &amp; Production Feed Pattern</span>
              </div>
              <span className="font-mono text-[11px] text-[#5f6368]">
                firestore.rules
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
              <div className="rounded-lg border border-[#dadce0] bg-[#f8fafd] px-3 py-2 space-y-1">
                <div className="font-semibold text-[#1f1f1f]">
                  Live Firestore Collections &amp; Atomic Write
                </div>
                <div className="text-[#444746] leading-relaxed">
                  <span className="font-mono">/products</span> (Canonical GTIN/specs) +{' '}
                  <span className="font-mono">collectionGroup(&apos;offers&apos;)</span> (price/stock/controls) +{' '}
                  <span className="font-mono">runTransaction</span> -&gt;{' '}
                  <span className="font-mono">/reservations</span>
                </div>
              </div>
              <div className="rounded-lg border border-[#dadce0] bg-[#f8fafd] px-3 py-2 space-y-1">
                <div className="font-semibold text-[#1f1f1f]">
                  Google &amp; Microsoft Scale Ingestion Mirror
                </div>
                <div className="text-[#444746] leading-relaxed">
                  Batch Feeds · Sub-Minute Push APIs · 15–60m Local POS Sync ·{' '}
                  <span className="font-mono">Schema.org</span> Crawl -&gt; Entity Linking &amp; Spot Checks
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {caption && (
        <figcaption className="text-[11px] text-[#5f6368] leading-relaxed pt-1">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
