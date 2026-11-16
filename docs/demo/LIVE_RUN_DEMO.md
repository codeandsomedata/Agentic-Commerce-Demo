# Live Run Demo Transcript — Agentic Commerce Studio

Captured against the running server (`http://localhost:3000`) backed by live Cloud Firestore (`firestore_live`, 5 canonical products / 12 merchant offers) and Cloud Gemini (`gemini-4-hydrogen`).

To reproduce locally:

```bash
npm run dev
# in a second terminal:
npm run demo
```

### Visual Snapshots
- **Copilot + 4-Stage Trace:** [01-copilot-trace-live.png](screenshots/01-copilot-trace-live.png)
- **Live Catalog Graph:** [02-catalog-graph.png](screenshots/02-catalog-graph.png)
- **End-to-End Architecture Diagram (PRD):** [03-prd-architecture-diagram.png](screenshots/03-prd-architecture-diagram.png)

---

## 1. Server Health Check

```bash
curl -s http://localhost:3000/api/health
```

```json
{
  "status": "ok",
  "service": "agentic-commerce-studio"
}
```

---

## 2. Parallel Product-Offer Graph Search (`POST /api/catalog/search`)

Tests `O(1)` parallel Firestore reads (`collection('products')` + `collectionGroup('offers')`) with dietary, budget, location, and stock filters, plus explicit `excluded_offers` diagnostics.

**Request:**

```json
{
  "query": "almond yogurt",
  "dietary_tags": ["dairy-free"],
  "max_price": 6,
  "location": "Mountain View",
  "must_be_in_stock": true
}
```

**Observed Summary Response:**

```json
{
  "data_source": "firestore_live",
  "total_products_scanned": 5,
  "total_offers_scanned": 12,
  "matched_count": 4,
  "excluded_count": 2,
  "query_latency_ms": 1
}
```

**Trap Offers Caught in `excluded_offers`:**
- **Nob Hill Foods (Mountain View, CA)** — `$4.99` excluded because `availability_status` is `out_of_stock` (cheaper price decoy).
- **Mollie Stone's Market (Palo Alto, CA)** — `$6.49` excluded because `price $6.49 exceeds max_price $6.00` and `location "Palo Alto, CA" does not match "Mountain View"`.

---

## 3. Authoritative Policy Gate (`POST /api/catalog/evaluate-reservation`)

### 3A. Blocked by `merchant_controls` (Target Grocery — `$2.29`)
Even though Target is in stock and cheaper than Whole Foods, `merchant_controls.agent_checkout_allowed` is `false`. The backend blocks autonomous checkout deterministically:

```json
{
  "ok": false,
  "intent": {
    "productId": "prod_kite_hill_vanilla_5oz",
    "offerId": "offer_target_mv_kh_vanilla",
    "productName": "Kite Hill Greek-Style Almond Yogurt - Vanilla",
    "merchantName": "Target Grocery",
    "location": "Mountain View, CA",
    "price": 2.29,
    "quantity": 1,
    "allowed": false,
    "reason": "Merchant policy blocks autonomous AI agent checkout (agent_checkout_allowed: false)."
  },
  "apiPayload": {
    "status": "blocked_by_merchant_controls",
    "product_id": "prod_kite_hill_vanilla_5oz",
    "offer_id": "offer_target_mv_kh_vanilla",
    "merchant_name": "Target Grocery",
    "merchant_controls": {
      "fulfillment_methods": ["drive_up"],
      "requires_confirmation": true,
      "agent_checkout_allowed": false,
      "max_quantity_per_order": 4
    },
    "reason": "merchant_controls.agent_checkout_allowed is false; human in-store or merchant-site checkout required."
  }
}
```

### 3B. Authorized Reservation (Whole Foods Market — `$2.49`)
Whole Foods allows agent checkout (`agent_checkout_allowed: true`), so the policy gate returns `action_authorized`, enabling the client's atomic Firestore `runTransaction` confirmation:

```json
{
  "ok": true,
  "intent": {
    "productId": "prod_kite_hill_vanilla_5oz",
    "offerId": "offer_wf_mv_kh_vanilla",
    "productName": "Kite Hill Greek-Style Almond Yogurt - Vanilla",
    "merchantName": "Whole Foods Market",
    "location": "Mountain View, CA",
    "price": 2.49,
    "quantity": 1,
    "allowed": true
  },
  "apiPayload": {
    "status": "action_authorized",
    "product_id": "prod_kite_hill_vanilla_5oz",
    "offer_id": "offer_wf_mv_kh_vanilla",
    "product_name": "Kite Hill Greek-Style Almond Yogurt - Vanilla",
    "merchant_name": "Whole Foods Market",
    "location": "Mountain View, CA",
    "unit_price": 2.49,
    "quantity": 1,
    "availability_status": "in_stock",
    "merchant_controls": {
      "max_quantity_per_order": 6,
      "fulfillment_methods": ["pickup", "same_day_delivery"],
      "agent_checkout_allowed": true,
      "requires_confirmation": true
    }
  }
}
```

---

## 4. Live Multi-Hop SSE Agent Run (`POST /api/agent/chat/stream`)

**Prompt:**
> *"Find dairy-free almond yogurt under $6 in Mountain View and reserve the cheapest eligible option."*

**Observed SSE Stream Breakdown:**
- `event: trace_update` (`x2` — emitted immediately after Step 1 `search_catalog` and Step 2 `reserve_offer`)
- `event: token` (`x1`)
- `event: done` (`x1`, `model: "gemini-4-hydrogen"`)

**Multi-Hop Tool Sequence:**
1. **Step 1 (`search_catalog`)** — Scans live Firestore graph and surfaces both eligible matches and excluded offers (`Nob Hill $4.99 out_of_stock`, `Mollie Stone's $6.49 Palo Alto`).
2. **Step 2 (`reserve_offer`)** — Bypasses Target (`$2.29`, `agent_checkout_allowed: false`) and prepares the reservation at **Whole Foods Market (`$2.49`)**.

**Observed Grounded Agent Reply:**

> Here are the matching dairy-free almond yogurt options under $6.00 in Mountain View, CA, along with the reservation result:
>
> ### Reservation Prepared (Cheapest Eligible Option)
> - **Product:** Kite Hill Greek-Style Almond Yogurt - Vanilla (5.3 oz cup) (`prod_kite_hill_vanilla_5oz`)
> - **Merchant:** Whole Foods Market — Mountain View, CA (`offer_wf_mv_kh_vanilla`)
> - **Unit Price:** $2.49 (Quantity: 1)
> - **Availability:** `in_stock` (22 units)
> - **Agent Checkout:** Allowed (`pickup`, `same_day_delivery`; max 6 per order; `requires_confirmation: true`)
> - **Reservation Status:** `action_authorized`
>
> ### Why Target Grocery ($2.29) Was Not Reserved
> - **Target Grocery — Mountain View, CA:** Kite Hill Greek-Style Almond Yogurt - Vanilla (5.3 oz cup) is **$2.29** and `in_stock` (18 units), **but** `merchant_controls.agent_checkout_allowed` is **`false`**. Even though it is cheaper and in stock, the merchant blocks autonomous agent checkout.
>
> ### Other Eligible Mountain View Matches Under $6.00
> - **Whole Foods Market — Mountain View, CA:** Kite Hill Almond Milk Yogurt - Plain Unsweetened (16 oz tub) — **$5.49** (`in_stock`, 14 units, agent checkout allowed)
> - **Sprouts Farmers Market — Mountain View, CA:** Kite Hill Almond Milk Yogurt - Plain Unsweetened (16 oz tub) — **$5.79** (`low_stock`, 3 units, agent checkout allowed)
>
> ### Notable Excluded Offers
> - **Nob Hill Foods (Mountain View, CA):** Kite Hill Almond Milk Yogurt - Plain Unsweetened at **$4.99** — excluded because `availability_status` is `out_of_stock`.
> - **Mollie Stone's Market (Palo Alto, CA):** Kite Hill Almond Milk Yogurt - Plain Unsweetened at **$6.49** — excluded because the price exceeds $6.00 and the location is Palo Alto, CA.
