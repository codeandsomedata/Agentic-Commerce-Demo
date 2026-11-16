#!/usr/bin/env node

const BASE_URL = process.env.DEMO_URL || 'http://localhost:3000';

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function run() {
  console.log(`\n=== Agentic Commerce Studio — Live End-to-End Demo (${BASE_URL}) ===\n`);

  // 1. Health check
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const health = await healthRes.json();
  console.log('1) Health Check:', JSON.stringify(health));

  // 2. O(1) Firestore Catalog Search
  const search = await postJson('/api/catalog/search', {
    query: 'almond yogurt',
    dietary_tags: ['dairy-free'],
    max_price: 6,
    location: 'Mountain View',
    must_be_in_stock: true,
  });
  console.log('\n2) POST /api/catalog/search (dairy-free almond yogurt <= $6 in Mountain View):');
  console.log(
    JSON.stringify(
      {
        status: search.status,
        data_source: search.data.data_source,
        total_products_scanned: search.data.total_products_scanned,
        total_offers_scanned: search.data.total_offers_scanned,
        matched_count: search.data.matched_count,
        excluded_offers: search.data.excluded_offers,
        query_latency_ms: search.data.query_latency_ms,
      },
      null,
      2,
    ),
  );

  // 3. Policy Gate Test — Blocked Merchant
  const blocked = await postJson('/api/catalog/evaluate-reservation', {
    product_id: 'prod_kite_hill_vanilla_5oz',
    offer_id: 'offer_target_mv_kh_vanilla',
    quantity: 1,
  });
  console.log('\n3) Policy Gate Test — Target $2.29 (agent_checkout_allowed: false):');
  console.log(JSON.stringify(blocked.data, null, 2));

  // 4. Policy Gate Test — Authorized Merchant
  const allowed = await postJson('/api/catalog/evaluate-reservation', {
    product_id: 'prod_kite_hill_vanilla_5oz',
    offer_id: 'offer_wf_mv_kh_vanilla',
    quantity: 1,
  });
  console.log('\n4) Policy Gate Test — Whole Foods $2.49 (agent_checkout_allowed: true):');
  console.log(JSON.stringify(allowed.data, null, 2));

  // 5. Multi-hop Cloud Gemini SSE Agent Stream
  console.log('\n5) POST /api/agent/chat/stream (Live Multi-Hop Agent Orchestration):');
  const sseRes = await fetch(`${BASE_URL}/api/agent/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt:
        'Find dairy-free almond yogurt under $6 in Mountain View and reserve the cheapest eligible option.',
    }),
  });
  const sseText = await sseRes.text();
  const events = sseText
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const event = chunk.match(/^event:\s*(.+)$/m)?.[1];
      const raw = chunk.match(/^data:\s*(.+)$/m)?.[1];
      return { event, data: raw ? JSON.parse(raw) : null };
    });

  const eventCounts = events.reduce((acc, item) => {
    if (item.event) acc[item.event] = (acc[item.event] || 0) + 1;
    return acc;
  }, {});
  const doneEvent = events.find((e) => e.event === 'done')?.data;

  console.log('SSE Event Counts:', JSON.stringify(eventCounts));
  console.log('Agent Model:', doneEvent?.trace?.model ?? 'N/A');
  console.log(
    'Tool Hops:',
    JSON.stringify(
      doneEvent?.trace?.steps?.map((s) => ({
        step: s.step,
        tool: s.tool_name,
        args: s.args,
      })),
      null,
      2,
    ),
  );
  const reserveStep = doneEvent?.trace?.steps?.find((s) => s.tool_name === 'reserve_offer');
  console.log('Reserve Tool Outcome:', JSON.stringify(reserveStep?.response ?? null, null, 2));
  console.log('\nAssistant Grounded Reply:\n' + (doneEvent?.reply || '(no reply)'));
  console.log('\n=== Demo Complete ===\n');
}

run().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
