import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Database, RefreshCw, Save, Search, XCircle } from 'lucide-react';
import type {
  AvailabilityStatus,
  Offer,
  ProductWithOffers,
  Reservation,
} from '../types/commerce.ts';

interface CatalogGraphViewProps {
  user: User | null;
  catalog: ProductWithOffers[];
  isLiveSeeded: boolean;
  loading: boolean;
  seeding: boolean;
  reservations: Reservation[];
  onSignIn: () => Promise<User | null>;
  onSeedCatalog: () => Promise<void>;
  onRefreshCatalog: () => Promise<void>;
  onSaveOffer: (
    productId: string,
    offerId: string,
    updates: {
      price: number;
      availability_status: AvailabilityStatus;
      stock_count: number;
      agent_checkout_allowed: boolean;
      max_quantity_per_order: number;
      requires_confirmation: boolean;
      fulfillment_methods: string[];
    },
  ) => Promise<void>;
  onCancelReservation: (reservationId: string) => Promise<void>;
}

interface OfferDraft {
  price: string;
  availability_status: AvailabilityStatus;
  stock_count: string;
  agent_checkout_allowed: boolean;
  requires_confirmation: boolean;
}

export function CatalogGraphView({
  user,
  catalog,
  isLiveSeeded,
  loading,
  seeding,
  reservations,
  onSignIn,
  onSeedCatalog,
  onRefreshCatalog,
  onSaveOffer,
  onCancelReservation,
}: CatalogGraphViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'allowed' | 'restricted'>('all');
  const [drafts, setDrafts] = useState<Record<string, OfferDraft>>({});
  const [savingOfferId, setSavingOfferId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const totalOffers = catalog.reduce((sum, prod) => sum + prod.offers.length, 0);

  const getDraft = (offer: Offer): OfferDraft => {
    return (
      drafts[offer.id] ?? {
        price: offer.price.toFixed(2),
        availability_status: offer.availability_status,
        stock_count: String(offer.stock_count),
        agent_checkout_allowed: offer.merchant_controls.agent_checkout_allowed,
        requires_confirmation: offer.merchant_controls.requires_confirmation,
      }
    );
  };

  const updateDraft = (offer: Offer, patch: Partial<OfferDraft>) => {
    const current = getDraft(offer);
    setDrafts((prev) => ({
      ...prev,
      [offer.id]: { ...current, ...patch },
    }));
  };

  const handleSave = async (productId: string, offer: Offer) => {
    setFeedback(null);
    const draft = getDraft(offer);
    const parsedPrice = Number(draft.price);
    const parsedStock = Number(draft.stock_count);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setFeedback({ type: 'error', text: 'Price must be greater than $0.00.' });
      return;
    }
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      setFeedback({ type: 'error', text: 'Stock count cannot be negative.' });
      return;
    }

    setSavingOfferId(offer.id);
    try {
      await onSaveOffer(productId, offer.id, {
        price: parsedPrice,
        availability_status: draft.availability_status,
        stock_count: Math.round(parsedStock),
        agent_checkout_allowed: draft.agent_checkout_allowed,
        max_quantity_per_order: offer.merchant_controls.max_quantity_per_order,
        requires_confirmation: draft.requires_confirmation,
        fulfillment_methods: offer.merchant_controls.fulfillment_methods,
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[offer.id];
        return next;
      });
      setFeedback({
        type: 'success',
        text: `Updated ${offer.merchant_name} offer in Cloud Firestore.`,
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update offer in Firestore.',
      });
    } finally {
      setSavingOfferId(null);
    }
  };

  const handleSeedClick = async () => {
    setFeedback(null);
    await onSeedCatalog();
    setDrafts({});
  };

  const filteredProducts = catalog
    .map((product) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesProduct =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.brand.toLowerCase().includes(q) ||
        product.dietary_tags.some((t) => t.toLowerCase().includes(q));

      const filteredOffers = product.offers.filter((offer) => {
        const matchesOfferText =
          !q ||
          matchesProduct ||
          offer.merchant_name.toLowerCase().includes(q) ||
          offer.location.toLowerCase().includes(q);

        if (!matchesOfferText) return false;

        if (filterMode === 'allowed') {
          return (
            offer.availability_status !== 'out_of_stock' &&
            offer.merchant_controls.agent_checkout_allowed
          );
        }
        if (filterMode === 'restricted') {
          return (
            offer.availability_status === 'out_of_stock' ||
            !offer.merchant_controls.agent_checkout_allowed
          );
        }
        return true;
      });

      return { ...product, offers: filteredOffers };
    })
    .filter((p) => p.offers.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Top Overview & Actions */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Firestore Catalog Graph
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Canonical product identity (<span className="font-mono text-xs text-slate-800">/products</span>) is stored separately from volatile merchant pricing, inventory, and <span className="font-mono text-xs text-slate-800">merchant_controls</span> (<span className="font-mono text-xs text-slate-800">/offers</span> sub-collection).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2 mr-2">
            <span className="font-mono-tabular font-semibold text-slate-900">
              {catalog.length}
            </span>{' '}
            products
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular font-semibold text-slate-900">
              {totalOffers}
            </span>{' '}
            offers
            <span aria-hidden="true">·</span>
            <span className={isLiveSeeded ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
              {isLiveSeeded ? 'Live Firestore' : 'Seed Preview'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void onRefreshCatalog()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => void handleSeedClick()}
              disabled={seeding}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {seeding
                  ? 'Writing to Firestore...'
                  : isLiveSeeded
                    ? 'Reset Seed Catalog'
                    : 'Seed Live Catalog'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onSignIn()}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In to Edit & Seed Firestore
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter by product, merchant, city, or dietary tag..."
            className="w-full pl-10 pr-4 py-2 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(
            [
              { id: 'all', label: 'All Offers' },
              { id: 'allowed', label: 'Agent Actionable' },
              { id: 'restricted', label: 'Blocked or Out of Stock' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterMode === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Product Identity + Nested Offers Sub-collection List */}
      <div className="space-y-6">
        {filteredProducts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-10 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-900">No matching catalog entries</div>
            <p className="text-xs text-slate-500">
              Clear your search filter or switch to All Offers to inspect the full product graph.
            </p>
          </div>
        ) : (
          filteredProducts.map((product) => (
            <div
              key={product.id}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden"
            >
              {/* Parent Canonical Product Header */}
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-slate-900">
                      {product.name}
                    </h2>
                    <span className="font-mono-tabular text-xs text-slate-500">
                      {product.id}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{product.brand}</span>
                    <span aria-hidden="true">·</span>
                    <span>{product.unit_size}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">GTIN {product.gtin}</span>
                    <span aria-hidden="true">·</span>
                    <span>{product.dietary_tags.join(' · ')}</span>
                  </div>
                </div>
                <div className="text-xs font-mono-tabular text-slate-500 shrink-0">
                  /products/{product.id}/offers ({product.offers.length})
                </div>
              </div>

              {/* Nested Offers Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                      <th className="py-2.5 px-5">Merchant & Location</th>
                      <th className="py-2.5 px-4">Price (USD)</th>
                      <th className="py-2.5 px-4">Availability Status</th>
                      <th className="py-2.5 px-4">Stock</th>
                      <th className="py-2.5 px-4">Agent Checkout Control</th>
                      <th className="py-2.5 px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {product.offers.map((offer) => {
                      const draft = getDraft(offer);
                      const canEdit = Boolean(user && isLiveSeeded);

                      return (
                        <tr key={offer.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-5">
                            <div className="font-medium text-slate-900">
                              {offer.merchant_name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {offer.location} · {offer.merchant_controls.fulfillment_methods.join(', ')}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {canEdit ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={draft.price}
                                onChange={(e) => updateDraft(offer, { price: e.target.value })}
                                aria-label={`Price for ${offer.merchant_name}`}
                                className="w-24 px-2.5 py-1.5 font-mono-tabular text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                              />
                            ) : (
                              <span className="font-mono-tabular text-slate-900 font-medium">
                                ${offer.price.toFixed(2)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {canEdit ? (
                              <select
                                value={draft.availability_status}
                                onChange={(e) =>
                                  updateDraft(offer, {
                                    availability_status: e.target.value as AvailabilityStatus,
                                  })
                                }
                                aria-label={`Availability for ${offer.merchant_name}`}
                                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-blue-600"
                              >
                                <option value="in_stock">in_stock</option>
                                <option value="low_stock">low_stock</option>
                                <option value="out_of_stock">out_of_stock</option>
                              </select>
                            ) : (
                              <span
                                className={`text-xs font-medium ${
                                  offer.availability_status === 'in_stock'
                                    ? 'text-emerald-700'
                                    : offer.availability_status === 'low_stock'
                                      ? 'text-amber-700'
                                      : 'text-rose-700'
                                }`}
                              >
                                {offer.availability_status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {canEdit ? (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={draft.stock_count}
                                onChange={(e) => updateDraft(offer, { stock_count: e.target.value })}
                                aria-label={`Stock count for ${offer.merchant_name}`}
                                className="w-20 px-2.5 py-1.5 font-mono-tabular text-xs border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                              />
                            ) : (
                              <span className="font-mono-tabular text-xs text-slate-700">
                                {offer.stock_count}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {canEdit ? (
                              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={draft.agent_checkout_allowed}
                                  onChange={(e) =>
                                    updateDraft(offer, {
                                      agent_checkout_allowed: e.target.checked,
                                    })
                                  }
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                />
                                <span
                                  className={
                                    draft.agent_checkout_allowed
                                      ? 'text-emerald-700 font-medium'
                                      : 'text-rose-700 font-medium'
                                  }
                                >
                                  {draft.agent_checkout_allowed ? 'Allowed' : 'Blocked'}
                                </span>
                              </label>
                            ) : (
                              <span
                                className={`text-xs font-medium ${
                                  offer.merchant_controls.agent_checkout_allowed
                                    ? 'text-emerald-700'
                                    : 'text-rose-700'
                                }`}
                              >
                                {offer.merchant_controls.agent_checkout_allowed
                                  ? 'Allowed'
                                  : 'Blocked'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-5 text-right">
                            {canEdit ? (
                              <button
                                type="button"
                                disabled={savingOfferId === offer.id}
                                onClick={() => void handleSave(product.id, offer)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                              >
                                <Save className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>{savingOfferId === offer.id ? 'Saving...' : 'Save'}</span>
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">
                                {user ? 'Seed first' : 'Read-only'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Persisted Reservations Ledger */}
      {user && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Committed Agent Reservations
              </h2>
              <p className="text-xs text-slate-500">
                Action receipts persisted in <span className="font-mono">/reservations</span> under your verified Google session.
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-slate-600">
              {reservations.length} total
            </span>
          </div>

          {reservations.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              No reservations recorded yet. Use Reserve Pickup in the Copilot Simulator to commit an action.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {reservations.map((res) => (
                <div
                  key={res.id}
                  className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-slate-900">{res.productName}</div>
                    <div className="text-xs text-slate-500">
                      {res.merchantName} · {res.location} · qty {res.quantity} ·{' '}
                      <span className="font-mono-tabular">${res.price.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium ${
                        res.status === 'reserved' ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {res.status}
                    </span>
                    {res.status === 'reserved' && (
                      <button
                        type="button"
                        onClick={() => void onCancelReservation(res.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-rose-700 border border-slate-200 rounded-md cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Cancel</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
