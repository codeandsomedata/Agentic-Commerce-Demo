import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionDeclaration,
} from '@google/genai';
import { initializeApp, getApps } from 'firebase/app';
import { collection, collectionGroup, getDocs, getFirestore } from 'firebase/firestore';
import { buildSeedCatalogGraph } from './src/data/seedCatalog.ts';
import type {
  AgentTrace,
  CatalogMatch,
  CatalogSearchResponse,
  ExcludedOfferNote,
  Offer,
  PendingReservationIntent,
  Product,
  ProductWithOffers,
  SearchCatalogParams,
  ToolExecutionStep,
} from './src/types/commerce.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

// Load Firebase applet config for live Firestore catalog queries
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8')) as {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
};

const fbApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig, 'server-catalog-reader');
const firestoreDb = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function loadCatalogGraphFromFirestore(): Promise<{
  catalog: ProductWithOffers[];
  dataSource: 'firestore_live' | 'seed_preview';
}> {
  try {
    const [productSnap, offersGroupSnap] = await Promise.all([
      getDocs(collection(firestoreDb, 'products')),
      getDocs(collectionGroup(firestoreDb, 'offers')),
    ]);

    if (productSnap.empty) {
      return {
        catalog: buildSeedCatalogGraph('seed_preview'),
        dataSource: 'seed_preview',
      };
    }

    const offersByProduct = new Map<string, Offer[]>();
    for (const offerDoc of offersGroupSnap.docs) {
      const offer = offerDoc.data() as Offer;
      const list = offersByProduct.get(offer.productId) ?? [];
      list.push(offer);
      offersByProduct.set(offer.productId, list);
    }

    const catalog: ProductWithOffers[] = productSnap.docs.map((prodDoc) => {
      const productData = prodDoc.data() as Product;
      const offers = offersByProduct.get(prodDoc.id) ?? [];
      offers.sort((a, b) => a.price - b.price);
      return {
        ...productData,
        offers,
      };
    });

    return {
      catalog,
      dataSource: 'firestore_live',
    };
  } catch (err) {
    console.warn('Firestore catalog read failed, falling back to seed preview:', err);
    return {
      catalog: buildSeedCatalogGraph('seed_preview'),
      dataSource: 'seed_preview',
    };
  }
}

function executeCatalogSearch(
  catalog: ProductWithOffers[],
  dataSource: 'firestore_live' | 'seed_preview',
  params: SearchCatalogParams,
): CatalogSearchResponse {
  const startedAt = Date.now();
  const queryTerms = (params.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !['under', 'below', 'in', 'at', 'for', 'the', 'me', 'get', 'find'].includes(t));

  const requiredTags = (params.dietary_tags ?? []).map((t) => t.toLowerCase().trim());
  const locationFilter = (params.location ?? '').toLowerCase().trim();
  const maxPrice = typeof params.max_price === 'number' ? params.max_price : undefined;
  const mustBeInStock = params.must_be_in_stock ?? true;
  const onlyAgentCheckout = params.only_agent_checkout_allowed ?? false;

  const matches: CatalogMatch[] = [];
  const excluded: ExcludedOfferNote[] = [];
  let totalOffersScanned = 0;

  for (const product of catalog) {
    const searchableProductText = [
      product.name,
      product.brand,
      product.category,
      product.description,
      ...product.dietary_tags,
    ]
      .join(' ')
      .toLowerCase();

    const matchesQuery =
      queryTerms.length === 0 ||
      queryTerms.every((term) => searchableProductText.includes(term));

    const matchesDietary =
      requiredTags.length === 0 ||
      requiredTags.every((tag) =>
        product.dietary_tags.some((pt) => pt.toLowerCase().includes(tag)),
      );

    for (const offer of product.offers) {
      totalOffersScanned += 1;

      if (!matchesQuery || !matchesDietary) {
        continue;
      }

      const reasons: string[] = [];

      if (maxPrice !== undefined && offer.price > maxPrice) {
        reasons.push(`price $${offer.price.toFixed(2)} exceeds max_price $${maxPrice.toFixed(2)}`);
      }

      if (mustBeInStock && offer.availability_status === 'out_of_stock') {
        reasons.push('availability_status is out_of_stock');
      }

      if (
        locationFilter &&
        !offer.location.toLowerCase().includes(locationFilter)
      ) {
        reasons.push(`location "${offer.location}" does not match "${params.location}"`);
      }

      if (onlyAgentCheckout && !offer.merchant_controls.agent_checkout_allowed) {
        reasons.push('merchant_controls.agent_checkout_allowed is false');
      }

      // Clean copy of product without nested offers array for clean API payload
      const canonicalProduct: Product = {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        description: product.description,
        unit_size: product.unit_size,
        gtin: product.gtin,
        dietary_tags: product.dietary_tags,
        ownerId: product.ownerId,
      };

      if (reasons.length === 0) {
        matches.push({
          product: canonicalProduct,
          offer,
        });
      } else {
        excluded.push({
          product_name: product.name,
          merchant_name: offer.merchant_name,
          location: offer.location,
          price: offer.price,
          availability_status: offer.availability_status,
          agent_checkout_allowed: offer.merchant_controls.agent_checkout_allowed,
          reasons,
        });
      }
    }
  }

  matches.sort((a, b) => a.offer.price - b.offer.price);

  return {
    data_source: dataSource,
    total_products_scanned: catalog.length,
    total_offers_scanned: totalOffersScanned,
    matched_count: matches.length,
    matches,
    excluded_offers: excluded,
    query_latency_ms: Math.max(1, Date.now() - startedAt),
  };
}

function evaluateOfferReservation(
  catalog: ProductWithOffers[],
  productId: string,
  offerId: string,
  quantity = 1,
): {
  ok: boolean;
  intent: PendingReservationIntent | null;
  apiPayload: Record<string, unknown>;
} {
  const product = catalog.find((p) => p.id === productId);
  if (!product) {
    return {
      ok: false,
      intent: null,
      apiPayload: {
        status: 'rejected',
        reason: `Product "${productId}" was not found in catalog.`,
      },
    };
  }

  const offer = product.offers.find((o) => o.id === offerId);
  if (!offer) {
    return {
      ok: false,
      intent: null,
      apiPayload: {
        status: 'rejected',
        reason: `Offer "${offerId}" was not found under product "${product.name}".`,
      },
    };
  }

  if (offer.availability_status === 'out_of_stock' || offer.stock_count < quantity) {
    return {
      ok: false,
      intent: {
        productId: product.id,
        offerId: offer.id,
        productName: product.name,
        merchantName: offer.merchant_name,
        location: offer.location,
        price: offer.price,
        quantity,
        allowed: false,
        reason: 'Offer is currently out of stock or insufficient inventory.',
      },
      apiPayload: {
        status: 'blocked_inventory',
        product_id: product.id,
        offer_id: offer.id,
        availability_status: offer.availability_status,
        stock_count: offer.stock_count,
        merchant_controls: offer.merchant_controls,
        reason: 'Insufficient inventory for agent reservation.',
      },
    };
  }

  if (!offer.merchant_controls.agent_checkout_allowed) {
    return {
      ok: false,
      intent: {
        productId: product.id,
        offerId: offer.id,
        productName: product.name,
        merchantName: offer.merchant_name,
        location: offer.location,
        price: offer.price,
        quantity,
        allowed: false,
        reason: 'Merchant policy blocks autonomous AI agent checkout (agent_checkout_allowed: false).',
      },
      apiPayload: {
        status: 'blocked_by_merchant_controls',
        product_id: product.id,
        offer_id: offer.id,
        merchant_name: offer.merchant_name,
        merchant_controls: offer.merchant_controls,
        reason: 'merchant_controls.agent_checkout_allowed is false; human in-store or merchant-site checkout required.',
      },
    };
  }

  if (quantity > offer.merchant_controls.max_quantity_per_order) {
    return {
      ok: false,
      intent: {
        productId: product.id,
        offerId: offer.id,
        productName: product.name,
        merchantName: offer.merchant_name,
        location: offer.location,
        price: offer.price,
        quantity,
        allowed: false,
        reason: `Requested quantity (${quantity}) exceeds merchant max_quantity_per_order (${offer.merchant_controls.max_quantity_per_order}).`,
      },
      apiPayload: {
        status: 'blocked_quantity_cap',
        product_id: product.id,
        offer_id: offer.id,
        requested_quantity: quantity,
        merchant_controls: offer.merchant_controls,
        reason: `Quantity exceeds merchant_controls.max_quantity_per_order (${offer.merchant_controls.max_quantity_per_order}).`,
      },
    };
  }

  return {
    ok: true,
    intent: {
      productId: product.id,
      offerId: offer.id,
      productName: product.name,
      merchantName: offer.merchant_name,
      location: offer.location,
      price: offer.price,
      quantity,
      allowed: true,
    },
    apiPayload: {
      status: 'action_authorized',
      product_id: product.id,
      offer_id: offer.id,
      product_name: product.name,
      merchant_name: offer.merchant_name,
      location: offer.location,
      unit_price: offer.price,
      quantity,
      availability_status: offer.availability_status,
      merchant_controls: offer.merchant_controls,
    },
  };
}

const searchCatalogTool: FunctionDeclaration = {
  name: 'search_catalog',
  description:
    'Query the Firestore Commerce Catalog Graph (canonical products and nested merchant offers) using structured filters such as product keywords, max_price, location, dietary_tags, stock status, and merchant_controls.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Keywords matching product name, brand, or category (e.g., "Kite Hill yogurt", "oat milk").',
      },
      max_price: {
        type: Type.NUMBER,
        description: 'Maximum unit price in USD (e.g., 6 for "under $6").',
      },
      must_be_in_stock: {
        type: Type.BOOLEAN,
        description: 'Whether to exclude out_of_stock offers. Defaults to true when shopping.',
      },
      dietary_tags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'Dietary requirements such as ["vegan", "dairy-free", "gluten-free"].',
      },
      location: {
        type: Type.STRING,
        description: 'City or region filter (e.g., "Mountain View", "Palo Alto", "San Francisco").',
      },
      only_agent_checkout_allowed: {
        type: Type.BOOLEAN,
        description: 'Set true only when the user explicitly asks for offers that allow AI agent checkout or reservations.',
      },
    },
  },
};

const reserveOfferTool: FunctionDeclaration = {
  name: 'reserve_offer',
  description:
    'Evaluate and prepare an agentic reservation action for a specific product_id and offer_id returned by search_catalog, validating inventory and merchant_controls.agent_checkout_allowed.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      product_id: {
        type: Type.STRING,
        description: 'Canonical product ID from search_catalog.',
      },
      offer_id: {
        type: Type.STRING,
        description: 'Specific merchant offer ID from search_catalog.',
      },
      quantity: {
        type: Type.INTEGER,
        description: 'Number of units to reserve (default 1).',
      },
    },
    required: ['product_id', 'offer_id'],
  },
};

const SYSTEM_INSTRUCTION = `You are a Copilot Agentic Commerce Assistant backed by a live Cloud Firestore Catalog Graph.
You MUST NEVER invent prices, store locations, inventory counts, or merchant policies.
Always call \`search_catalog\` first whenever the user asks about products, prices, dietary options, locations, or availability.
If the user asks to reserve, hold, or buy the cheapest/best matching item, first call \`search_catalog\` (if you don't already have the exact product_id and offer_id from this conversation) and then call \`reserve_offer\` on the eligible offer.
Pay strict attention to:
1. \`availability_status\` ("in_stock", "low_stock", "out_of_stock")
2. \`merchant_controls.agent_checkout_allowed\` (if false, explicitly explain that the merchant blocks autonomous agent checkout even if the item is in stock!)
3. \`excluded_offers\` (briefly mention notable exclusions if helpful, e.g., why a cheaper out-of-stock offer or an over-budget Palo Alto offer was filtered out).
Keep your final response concise, structured, accurate to the cent, and grounded strictly in the tool response.`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'agentic-commerce-studio' });
  });

  app.use(
    '/litertlm-wasm',
    express.static(path.resolve(__dirname, 'node_modules/@litert-lm/core/wasm')),
  );

  app.post('/api/catalog/search', async (req, res) => {
    try {
      const params = (req.body || {}) as SearchCatalogParams;
      const { catalog, dataSource } = await loadCatalogGraphFromFirestore();
      const result = executeCatalogSearch(catalog, dataSource, params);
      res.json(result);
    } catch (error) {
      console.error('Catalog search error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to query catalog.',
      });
    }
  });

  app.post('/api/catalog/evaluate-reservation', async (req, res) => {
    try {
      const { product_id, offer_id, quantity } = (req.body || {}) as {
        product_id?: string;
        offer_id?: string;
        quantity?: number;
      };
      if (!product_id || !offer_id) {
        res.status(400).json({ error: 'product_id and offer_id are required.' });
        return;
      }
      const { catalog } = await loadCatalogGraphFromFirestore();
      const result = evaluateOfferReservation(
        catalog,
        product_id,
        offer_id,
        typeof quantity === 'number' && quantity > 0 ? quantity : 1,
      );
      res.json(result);
    } catch (error) {
      console.error('Evaluate reservation error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to evaluate reservation.',
      });
    }
  });

  const MAX_TOOL_HOPS = 4;

  async function runAgentOrchestration(options: {
    prompt: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    onTraceUpdate?: (trace: AgentTrace, matches: CatalogMatch[], pendingReservation: PendingReservationIntent | null) => void;
    onToken?: (chunk: string) => void;
  }): Promise<{
    reply: string;
    matches: CatalogMatch[];
    pendingReservation: PendingReservationIntent | null;
    trace: AgentTrace;
  }> {
    const startTime = Date.now();
    const traceId = `trace_${startTime}`;
    const trimmedPrompt = options.prompt.trim();
    const ai = getGeminiClient();
    const { catalog, dataSource } = await loadCatalogGraphFromFirestore();

    const priorTurns: Content[] = (options.history ?? [])
      .slice(-6)
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    const currentContents: Content[] = [
      ...priorTurns,
      { role: 'user', parts: [{ text: trimmedPrompt }] },
    ];

    const tools = [{ functionDeclarations: [searchCatalogTool, reserveOfferTool] }];
    const steps: ToolExecutionStep[] = [];
    let matchedItems: CatalogMatch[] = [];
    let pendingReservation: PendingReservationIntent | null = null;
    let finalAnswerText = '';

    const buildTraceSnapshot = (streaming: boolean): AgentTrace => {
      const toolNames = steps.map((s) => s.tool_name);
      const toolCalled = toolNames.length > 0 ? toolNames.join(' -> ') : null;
      const latestStep = steps[steps.length - 1] ?? null;
      const combinedParams =
        steps.length <= 1
          ? (latestStep?.extracted_parameters ?? null)
          : Object.fromEntries(
              steps.map((s) => [`step_${s.step}_${s.tool_name}`, s.extracted_parameters]),
            );
      const combinedApiResponse =
        steps.length <= 1
          ? (latestStep?.api_response ?? null)
          : {
              steps: steps.map((s) => ({
                step: s.step,
                tool_name: s.tool_name,
                response: s.api_response,
              })),
            };
      const toolContextInjected =
        steps.length === 0
          ? 'No tool execution required for this turn.'
          : JSON.stringify(combinedApiResponse, null, 2);

      return {
        id: traceId,
        timestamp: new Date(startTime).toISOString(),
        model: 'gemini-4-hydrogen',
        user_prompt: trimmedPrompt,
        tool_called: toolCalled,
        tool_decision_summary: toolCalled
          ? `Model executed ${steps.length} tool step${steps.length > 1 ? 's' : ''} (${toolCalled}) to ground response in ${dataSource === 'firestore_live' ? 'live Cloud Firestore' : 'Catalog Preview'} data instead of parametric memory.`
          : 'Model answered directly without invoking a catalog tool.',
        extracted_parameters: combinedParams,
        catalog_api_response: combinedApiResponse,
        steps: [...steps],
        final_grounded_prompt: {
          system_instruction: SYSTEM_INSTRUCTION,
          tool_context_injected: toolContextInjected,
          user_query: trimmedPrompt,
        },
        latency_ms: Date.now() - startTime,
        streaming,
      };
    };

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: currentContents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools,
        },
      });

      const candidateContent = response.candidates?.[0]?.content;
      const functionCalls = response.functionCalls ?? [];

      if (functionCalls.length === 0 || !candidateContent) {
        finalAnswerText = response.text ?? '';
        break;
      }

      currentContents.push(candidateContent);
      const functionResponseParts = [];

      for (const call of functionCalls) {
        const stepStart = Date.now();
        const toolName = call.name ?? 'unknown_tool';
        const args = (call.args as Record<string, unknown>) ?? {};

        if (toolName === 'search_catalog') {
          const searchResult = executeCatalogSearch(
            catalog,
            dataSource,
            args as SearchCatalogParams,
          );
          matchedItems = searchResult.matches;
          steps.push({
            step: steps.length + 1,
            tool_name: 'search_catalog',
            extracted_parameters: args,
            api_response: searchResult,
            duration_ms: Date.now() - stepStart,
          });
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: 'search_catalog',
              response: searchResult as unknown as Record<string, unknown>,
            },
          });
        } else if (toolName === 'reserve_offer') {
          const reserveArgs = args as {
            product_id?: string;
            offer_id?: string;
            quantity?: number;
          };
          const evalResult = evaluateOfferReservation(
            catalog,
            reserveArgs.product_id ?? '',
            reserveArgs.offer_id ?? '',
            reserveArgs.quantity ?? 1,
          );
          pendingReservation = evalResult.intent;
          steps.push({
            step: steps.length + 1,
            tool_name: 'reserve_offer',
            extracted_parameters: args,
            api_response: evalResult.apiPayload,
            duration_ms: Date.now() - stepStart,
          });
          functionResponseParts.push({
            functionResponse: {
              id: call.id,
              name: 'reserve_offer',
              response: evalResult.apiPayload,
            },
          });
        }
      }

      currentContents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      options.onTraceUpdate?.(
        buildTraceSnapshot(true),
        matchedItems,
        pendingReservation,
      );
    }

    if (!finalAnswerText) {
      const streamResp = await ai.models.generateContentStream({
        model: 'gemini-4-hydrogen',
        contents: currentContents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
      });
      for await (const chunk of streamResp) {
        const piece = chunk.text ?? '';
        if (piece) {
          finalAnswerText += piece;
          options.onToken?.(piece);
        }
      }
    } else if (options.onToken) {
      options.onToken(finalAnswerText);
    }

    const finalTrace = buildTraceSnapshot(false);
    return {
      reply: finalAnswerText,
      matches: matchedItems,
      pendingReservation,
      trace: finalTrace,
    };
  }

  app.post('/api/agent/chat', async (req, res) => {
    try {
      const { prompt, history } = req.body as {
        prompt?: string;
        history?: { role: 'user' | 'assistant'; content: string }[];
      };

      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Prompt is required.' });
        return;
      }

      const result = await runAgentOrchestration({ prompt, history });
      res.json(result);
    } catch (error) {
      console.error('Agent chat error:', error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected error during agent orchestration.',
      });
    }
  });

  app.post('/api/agent/chat/stream', async (req, res) => {
    const { prompt, history } = req.body as {
      prompt?: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await runAgentOrchestration({
        prompt,
        history,
        onTraceUpdate: (trace, matches, pendingReservation) => {
          sendEvent('trace_update', { trace, matches, pendingReservation });
        },
        onToken: (text) => {
          sendEvent('token', { text });
        },
      });
      sendEvent('done', result);
    } catch (error) {
      console.error('Agent stream error:', error);
      sendEvent('error', {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected error during agent orchestration.',
      });
    } finally {
      res.end();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Agentic Commerce Studio listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
