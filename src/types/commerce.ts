export type AvailabilityStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface MerchantControls {
  agent_checkout_allowed: boolean;
  max_quantity_per_order: number;
  requires_confirmation: boolean;
  fulfillment_methods: string[];
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  unit_size: string;
  gtin: string;
  dietary_tags: string[];
  ownerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Offer {
  id: string;
  productId: string;
  merchant_id: string;
  merchant_name: string;
  location: string;
  price: number;
  currency: 'USD';
  availability_status: AvailabilityStatus;
  stock_count: number;
  merchant_controls: MerchantControls;
  ownerId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProductWithOffers extends Product {
  offers: Offer[];
}

export interface CatalogMatch {
  product: Product;
  offer: Offer;
}

export interface ExcludedOfferNote {
  product_name: string;
  merchant_name: string;
  location: string;
  price: number;
  availability_status: AvailabilityStatus;
  agent_checkout_allowed: boolean;
  reasons: string[];
}

export interface SearchCatalogParams {
  query?: string;
  max_price?: number;
  must_be_in_stock?: boolean;
  dietary_tags?: string[];
  location?: string;
  only_agent_checkout_allowed?: boolean;
}

export interface ReserveOfferParams {
  product_id: string;
  offer_id: string;
  quantity?: number;
}

export interface CatalogSearchResponse {
  data_source: 'firestore_live' | 'seed_preview';
  total_products_scanned: number;
  total_offers_scanned: number;
  matched_count: number;
  matches: CatalogMatch[];
  excluded_offers: ExcludedOfferNote[];
  query_latency_ms: number;
}

export interface Reservation {
  id: string;
  userId: string;
  productId: string;
  offerId: string;
  productName: string;
  merchantName: string;
  location: string;
  price: number;
  quantity: number;
  status: 'reserved' | 'cancelled';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PendingReservationIntent {
  productId: string;
  offerId: string;
  productName: string;
  merchantName: string;
  location: string;
  price: number;
  quantity: number;
  allowed: boolean;
  reason?: string;
}

export interface ToolExecutionStep {
  step: number;
  tool_name: string;
  extracted_parameters: Record<string, unknown>;
  api_response: CatalogSearchResponse | Record<string, unknown>;
  duration_ms: number;
}

export interface AgentTrace {
  id: string;
  timestamp: string;
  model: string;
  user_prompt: string;
  tool_called: string | null;
  tool_decision_summary: string;
  extracted_parameters: Record<string, unknown> | null;
  catalog_api_response: CatalogSearchResponse | Record<string, unknown> | null;
  steps?: ToolExecutionStep[];
  final_grounded_prompt: {
    system_instruction: string;
    tool_context_injected: string;
    user_query: string;
  };
  latency_ms: number;
  streaming?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  matches?: CatalogMatch[];
  pendingReservation?: PendingReservationIntent | null;
  trace?: AgentTrace;
  error?: string;
}

export type ModelRuntime = 'cloud_gemini' | 'browser_litert';

export type LiteRtEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

