# Agentic Commerce Studio

A full-stack **Agentic Commerce** reference workbench built with **React 19**, **TypeScript**, **Tailwind CSS v4**, **Express**, and **Cloud Firestore**, supporting live switching between **Cloud Gemini (`gemini-4-hydrogen`)** and **on-device Browser LiteRT-LM (`@litert-lm/core` over WebGPU)**.

It demonstrates how a canonical **Product-Offer Catalog Graph**, **server-authoritative `merchant_controls`**, and **atomic Firestore transactions** turn an AI assistant from a hallucination-prone chatbot into a verifiable, policy-safe commerce agent.

---

## End-to-End Architecture

```text
+----------------------------------------------------------------------------+
| 1. FRONTEND WORKBENCH (React 19 + TypeScript + Vite 8 + Tailwind CSS v4)   |
|   [CopilotSimulator] <---> [TraceInspector (4-Stage)] <---> [CatalogGraph] |
|    Chat + Runtime Toggle     SSE Steps & Raw JSON          Live Offer Edit |
+-----------------------------------+----------------------------------------+
                                    |  User Prompt + Active Runtime Choice
                 +------------------+------------------+
                 |                                     |
                 v                                     v
+---------------------------------+   +--------------------------------------+
| 2A. CLOUD RUNTIME (Express)     |   | 2B. EDGE RUNTIME (Browser WebGPU)    |
| POST /api/agent/chat/stream     |   | @litert-lm/core + /litertlm-wasm     |
| @google/genai (gemini-4-hydro.) |   | AutoToolChat (Gemma 4 E2B / E4B)     |
| MAX_TOOL_HOPS=4 -> Live SSE     |   | Constrained Decoding + KV Compaction |
+----------------+----------------+   +------------------+-------------------+
                 |                                       |
                 +------------------+--------------------+
                                    |  Identical Tool Calls
                                    v
+----------------------------------------------------------------------------+
| 3. AUTHORITATIVE TOOL & POLICY GATE (Express Server - server.ts)           |
|  - search_catalog      -> POST /api/catalog/search (dietary, price, geo)   |
|  - reserve_offer       -> POST /api/catalog/evaluate-reservation           |
|  - Enforces merchant_controls.agent_checkout_allowed & max_qty_per_order   |
+-----------------------------------+----------------------------------------+
                                    |  O(1) Parallel Reads & Atomic Tx
                                    v
+----------------------------------------------------------------------------+
| 4. CLOUD FIRESTORE & PRODUCTION INGESTION LAYER                            |
|  - /products (Canonical GTIN/Brand) + collectionGroup("offers") (Price/Qty)|
|  - runTransaction: re-read offer -> write /reservations -> decrement stock |
|  - Production Feeds: Batch | Push APIs | Local POS | Schema.org Crawl      |
+----------------------------------------------------------------------------+
```

---

## Key Features

- **Dual-Pane Copilot & Trace Workbench**
  - **Consumer Copilot (`CopilotSimulator`)**: Grounded multi-merchant comparison cards, inline merchant policy blocks, and one-click reservation confirmations backed by Firestore `runTransaction`.
  - **Developer Trace Inspector (`TraceInspector`)**: Streams live 4-stage execution observability (`LLM Tool Decision` -> `Extracted JSON Params` -> `Raw Catalog API JSON` -> `Final Grounded Prompt`) with per-hop latency timings.
- **Hybrid Model Runtime Toggle (`Cloud Gemini` vs. `Browser LiteRT-LM`)**
  - **Cloud Gemini (`@google/genai`)**: Server-side bounded multi-hop orchestration (`MAX_TOOL_HOPS = 4`) streaming `trace_update`, `token`, and `done` events over SSE (`POST /api/agent/chat/stream`).
  - **Browser LiteRT-LM (`@litert-lm/core`)**: Runs Gemma 4 E2B / E4B (or custom `.litertlm` / `hf://` models) directly in the browser on WebGPU (`Backend.GPU`), serving WASM binaries from `/litertlm-wasm`, compacting search payloads for the 8,192-token KV-cache, and routing tool evaluations through the same Express policy endpoints.
- **Live Supply-Side Catalog Graph (`CatalogGraphView`)**
  - Edit offer `price`, `stock_count`, `availability_status`, and `merchant_controls` (`agent_checkout_allowed`, `max_quantity_per_order`, `requires_confirmation`) live in Firestore and immediately verify how the agent adapts.
  - Inspect and cancel persisted `/reservations` receipts.
- **PRD, Industry Catalog Design & Google Docs Export (`PrdView`)**
  - Includes full technical specification covering how Google (Shopping Graph / Merchant Center) and Microsoft (Merchant Center / Bing Shopping) maintain massive catalogs, adversarial trap data generation, and 3-tier agent evals, with one-click export to Google Docs via OAuth.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite 8
- **Backend:** Express 4 (`server.ts` serving both API routes, `/litertlm-wasm`, and Vite middleware on port 3000)
- **AI Runtimes:** `@google/genai` (`gemini-4-hydrogen`) + `@litert-lm/core` (WebGPU / WASM)
- **Database & Auth:** Firebase Authentication + Cloud Firestore (`collection` + `collectionGroup('offers')`, `runTransaction`, ESLint-validated `firestore.rules`)

---

## Repository Structure

```text
.
├── server.ts                          # Express server, Gemini SSE orchestrator, Catalog & Policy APIs, /litertlm-wasm
├── firestore.rules                    # Hardened Firestore security rules (recursive offers list + batch existsAfter)
├── firebase-blueprint.json            # Firestore schema blueprint
├── firebase-applet-config.json        # Firebase project & database configuration
├── scripts/
│   └── run-demo.mjs                   # Automated end-to-end live API + SSE demo runner
├── docs/
│   └── demo/
│       └── LIVE_RUN_DEMO.md           # Recorded live run transcript & tool trace outputs
└── src/
    ├── App.tsx                        # Main workbench shell, auth state, runtime & catalog wiring
    ├── components/
    │   ├── CopilotSimulator.tsx       # Consumer chat + Cloud/Edge runtime selector + reservation UI
    │   ├── TraceInspector.tsx         # 4-stage live developer trace & merchant_controls highlighter
    │   ├── CatalogGraphView.tsx       # Supply-side offer/policy editor & reservation history
    │   ├── PrdView.tsx                # PRD viewer + Google Docs OAuth export modal
    │   └── ArchitectureDiagram.tsx    # Interactive visual + ASCII end-to-end architecture diagram
    ├── data/
    │   ├── seedCatalog.ts             # 5 canonical products + 12 adversarial offers (decoys & policy traps)
    │   └── prdDocument.ts             # Structured PRD, Google/Microsoft catalog maintenance, Data Gen & Evals
    ├── lib/
    │   ├── firebase.ts                # O(1) parallel Firestore reads, atomic runTransaction, Docs OAuth
    │   ├── agentStream.ts             # SSE stream client for Cloud Gemini
    │   ├── litertAgent.ts             # On-device @litert-lm/core WebGPU tool orchestration + KV compaction
    │   └── googleDocsExport.ts        # Google Docs REST create + batchUpdate formatter
    └── types/
        └── commerce.ts                # Shared domain, trace, and runtime types
```

---

## Quick Start

### 1. Prerequisites
- Node.js `20+` (verified on `v22.23.2`)
- A Gemini API key (`GEMINI_API_KEY`) for the Cloud Gemini runtime
- Optional for on-device Browser LiteRT-LM: a WebGPU-capable Chromium browser

### 2. Install & Configure
```bash
npm install
cp .env.example .env
```
Set your environment variables in `.env`:
```env
GEMINI_API_KEY="your-gemini-api-key"
APP_URL="http://localhost:3000"
```

### 3. Run Locally
```bash
npm run dev
```
Open `http://localhost:3000`:
1. Click **Sign in with Google** (optional for read/chat; required for seeding or mutating Firestore catalog offers and creating reservations).
2. If your Firestore database is empty, click **Seed Live Firestore** in the **Catalog Graph** tab to populate the 5 canonical products and 12 adversarial offers.

### 4. Type-Check & Build
```bash
npm run lint
npm run build
```

---

## Live Demo Run

With the app running on port `3000`, execute the automated end-to-end demo script:

```bash
npm run demo
```

This runs live requests against `/api/health`, `/api/catalog/search`, `/api/catalog/evaluate-reservation` (verifying both the Target `$2.29` policy block and Whole Foods `$2.49` authorization), and `/api/agent/chat/stream` (multi-hop `search_catalog` -> `reserve_offer` SSE orchestration).

See the full captured output in **[docs/demo/LIVE_RUN_DEMO.md](docs/demo/LIVE_RUN_DEMO.md)**.

### Suggested Interactive Prompts in the UI
- **Policy & Inventory Traps:** *"Find dairy-free almond yogurt under $6 in Mountain View and reserve the cheapest eligible option."*
- **Quantity Cap Enforcement:** *"Reserve 4 tubs of Kite Hill Plain Almond Yogurt from Sprouts."* (`max_quantity_per_order: 2`, `stock_count: 3`)
- **Multi-Tag Dietary Intersection:** *"Show me vegan and gluten-free breakfast items under $8."*

---

## Adversarial Data & 3-Tier Evaluation Principles

1. **Controlled Adversarial Seeding (`src/data/seedCatalog.ts`)**
   - **Price Decoys:** Cheaper offers marked `out_of_stock` (e.g., Nob Hill `$4.99`).
   - **Governance Traps:** Cheaper in-stock offers where `merchant_controls.agent_checkout_allowed: false` (e.g., Target `$2.29`).
   - **Geo & Budget Boundaries:** Nearby-city offers exceeding `max_price` or outside the city filter (e.g., Palo Alto `$6.49`).
   - **Low-Stock & Quantity Caps:** `stock_count: 3` with `max_quantity_per_order: 2` to test atomic concurrency and cap rejection.
2. **3-Tier Evals**
   - **Tier 1 (Tool & Slot Assertions):** Verify `search_catalog` precedes `reserve_offer` within `MAX_TOOL_HOPS = 4` and extracted filters match user constraints.
   - **Tier 2 (Zero-Tolerance Policy & Concurrency Invariants):** Backend and Firestore `runTransaction` must block disallowed checkouts and prevent `stock_count < 0` under parallel reservations.
   - **Tier 3 (Grounded Synthesis):** Programmatic numeric diff ensures 100% of quoted prices/stock come from `trace.catalog_api_response`, paired with Edge vs. Cloud parity benchmarks.
