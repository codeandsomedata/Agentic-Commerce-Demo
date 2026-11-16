import { Database, Cpu, Layers } from 'lucide-react';
import { JsonHighlighter } from './JsonHighlighter.tsx';

const SAMPLE_GRAPH_MODEL = {
  collection: '/products/{productId}',
  canonical_identity: {
    id: 'prod_kite_hill_plain_16oz',
    name: 'Kite Hill Almond Milk Yogurt - Plain Unsweetened',
    gtin: '0850004321102',
    dietary_tags: ['vegan', 'dairy-free', 'plant-based'],
  },
  subcollection: '/products/{productId}/offers/{offerId}',
  volatile_offer_state: {
    merchant_id: 'merch_whole_foods_mv',
    merchant_name: 'Whole Foods Market',
    location: 'Mountain View, CA',
    price: 5.49,
    availability_status: 'in_stock',
    stock_count: 14,
    merchant_controls: {
      agent_checkout_allowed: true,
      max_quantity_per_order: 4,
      requires_confirmation: true,
      fulfillment_methods: ['pickup', 'same_day_delivery'],
    },
  },
};

const TOOL_SCHEMA_SAMPLE = {
  name: 'search_catalog',
  parameters: {
    query: 'STRING — Brand, title, or category keywords',
    max_price: 'NUMBER — Upper price bound in USD',
    must_be_in_stock: 'BOOLEAN — Filter out out_of_stock offers',
    dietary_tags: 'ARRAY<STRING> — e.g. ["vegan", "gluten-free"]',
    location: 'STRING — City or store fulfillment zone',
    only_agent_checkout_allowed: 'BOOLEAN — Enforce merchant_controls gate',
  },
};

export function ArchitectureView() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div className="border-b border-slate-200 pb-6 space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Commerce Foundation Architecture
        </h1>
        <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
          Reference blueprint showing how separating canonical product identity from volatile merchant offers and governance controls turns an LLM from a passive answer engine into a verifiable action engine.
        </p>
      </div>

      {/* Three Architectural Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
            <Database className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
            <span>01. Firestore Catalog Graph</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Canonical product attributes live in <span className="font-mono text-slate-800">/products</span> while volatile per-merchant pricing, inventory counts, and <span className="font-mono text-slate-800">merchant_controls</span> live in nested <span className="font-mono text-slate-800">/offers</span> sub-collections.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
            <Cpu className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
            <span>02. Catalog API & Tool Loop</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Express orchestrates <span className="font-mono text-slate-800">gemini-4-hydrogen</span> with strict <span className="font-mono text-slate-800">search_catalog</span> and <span className="font-mono text-slate-800">reserve_offer</span> function declarations so every price and stock claim is tool-grounded.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-slate-900 font-display font-semibold text-sm">
            <Layers className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
            <span>03. Dual-Pane Agentic UI</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Pairs a consumer Copilot chat surface with an inspectable 4-stage developer trace, bridging supply-side catalog pipelines and final user experience in one screen-shareable workbench.
          </p>
        </div>
      </div>

      {/* Schema & Tool Contracts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-slate-900 p-5 space-y-3 text-slate-100">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Identity vs. Offer Sub-Collection Model
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Decouples slow-changing product metadata from high-frequency store offer updates.
            </p>
          </div>
          <JsonHighlighter
            data={SAMPLE_GRAPH_MODEL}
            highlightKeys={['availability_status', 'merchant_controls', 'agent_checkout_allowed']}
            maxHeightClass="max-h-96"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-900 p-5 space-y-3 text-slate-100">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-100">
              Gemini FunctionDeclaration Contract
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Structured parameter extraction schema exposed to the server-side orchestration layer.
            </p>
          </div>
          <JsonHighlighter
            data={TOOL_SCHEMA_SAMPLE}
            highlightKeys={['max_price', 'must_be_in_stock', 'only_agent_checkout_allowed']}
            maxHeightClass="max-h-96"
          />
        </div>
      </div>
    </div>
  );
}
