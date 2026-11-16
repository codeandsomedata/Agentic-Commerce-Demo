import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  cancelReservationInFirestore,
  createReservationInFirestore,
  fetchCatalogGraph,
  fetchUserReservations,
  seedCatalogToFirestore,
  signInWithGoogle,
  signOutUser,
  testFirestoreConnection,
  updateOfferInFirestore,
} from './lib/firebase.ts';
import { buildSeedCatalogGraph } from './data/seedCatalog.ts';
import type {
  AvailabilityStatus,
  CatalogMatch,
  ChatMessage,
  LiteRtEngineStatus,
  ModelRuntime,
  ProductWithOffers,
  Reservation,
} from './types/commerce.ts';
import { streamAgentChat } from './lib/agentStream.ts';
import {
  LITERT_MODEL_PRESETS,
  initLiteRtEngine,
  runLiteRtAgentChat,
} from './lib/litertAgent.ts';
import { Header, type ActiveTab } from './components/Header.tsx';
import { CopilotSimulator } from './components/CopilotSimulator.tsx';
import { TraceInspector } from './components/TraceInspector.tsx';
import { CatalogGraphView } from './components/CatalogGraphView.tsx';
import { ArchitectureView } from './components/ArchitectureView.tsx';
import { PrdView } from './components/PrdView.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [catalog, setCatalog] = useState<ProductWithOffers[]>(() =>
    buildSeedCatalogGraph('seed_preview'),
  );
  const [isLiveSeeded, setIsLiveSeeded] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [runtime, setRuntime] = useState<ModelRuntime>('cloud_gemini');
  const [litertModelUri, setLitertModelUri] = useState(LITERT_MODEL_PRESETS[0].uri);
  const [litertToken, setLitertToken] = useState('');
  const [litertStatus, setLitertStatus] = useState<LiteRtEngineStatus>('idle');
  const [litertError, setLitertError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const result = await fetchCatalogGraph();
      if (result.isLiveSeeded && result.products.length > 0) {
        setCatalog(result.products);
        setIsLiveSeeded(true);
      } else {
        setCatalog(buildSeedCatalogGraph('seed_preview'));
        setIsLiveSeeded(false);
      }
    } catch (error) {
      console.error('Failed to load Firestore catalog:', error);
      setCatalog(buildSeedCatalogGraph('seed_preview'));
      setIsLiveSeeded(false);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadReservations = useCallback(async (uid: string) => {
    try {
      const items = await fetchUserReservations(uid);
      setReservations(items);
    } catch (error) {
      console.error('Failed to load reservations:', error);
    }
  }, []);

  useEffect(() => {
    void testFirestoreConnection();
    void loadCatalog();

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (nextUser) {
        void loadReservations(nextUser.uid);
        void loadCatalog();
      } else {
        setReservations([]);
      }
    });

    return () => unsubscribe();
  }, [loadCatalog, loadReservations]);

  const handleSignIn = async (): Promise<User | null> => {
    setGlobalError(null);
    try {
      const signedInUser = await signInWithGoogle();
      return signedInUser;
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : 'Google Sign-In was cancelled or failed.',
      );
      return null;
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
  };

  const handleSeedCatalog = async () => {
    if (!user) return;
    setSeeding(true);
    setGlobalError(null);
    try {
      await seedCatalogToFirestore(user.uid);
      await loadCatalog();
    } catch (error) {
      setGlobalError(
        error instanceof Error ? error.message : 'Failed to seed Firestore catalog.',
      );
    } finally {
      setSeeding(false);
    }
  };

  const handleSaveOffer = async (
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
  ) => {
    await updateOfferInFirestore(productId, offerId, {
      price: updates.price,
      availability_status: updates.availability_status,
      stock_count: updates.stock_count,
      merchant_controls: {
        agent_checkout_allowed: updates.agent_checkout_allowed,
        max_quantity_per_order: updates.max_quantity_per_order,
        requires_confirmation: updates.requires_confirmation,
        fulfillment_methods: updates.fulfillment_methods,
      },
    });
    await loadCatalog();
  };

  const handleReserveOffer = async (match: CatalogMatch): Promise<Reservation> => {
    if (!user) {
      throw new Error('Sign in with Google to commit a reservation.');
    }
    if (!isLiveSeeded) {
      await seedCatalogToFirestore(user.uid);
      await loadCatalog();
    }
    const created = await createReservationInFirestore({
      userId: user.uid,
      productId: match.product.id,
      offerId: match.offer.id,
      productName: match.product.name,
      merchantName: match.offer.merchant_name,
      location: match.offer.location,
      price: match.offer.price,
      quantity: 1,
    });
    await Promise.all([loadReservations(user.uid), loadCatalog()]);
    return created;
  };

  const handleCancelReservation = async (reservationId: string) => {
    await cancelReservationInFirestore(reservationId);
    if (user) {
      await loadReservations(user.uid);
    }
  };

  const handleInitLitert = async () => {
    setLitertStatus('loading');
    setLitertError(null);
    try {
      await initLiteRtEngine(litertModelUri, litertToken || undefined);
      setLitertStatus('ready');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to initialize LiteRT-LM WebGPU engine.';
      setLitertStatus('error');
      setLitertError(message);
    }
  };

  const handleChangeLitertModelUri = (uri: string) => {
    setLitertModelUri(uri);
    setLitertStatus('idle');
    setLitertError(null);
  };

  const selectedTrace =
    messages.find((m) => m.trace?.id === selectedTraceId)?.trace ??
    [...messages].reverse().find((m) => m.trace)?.trace ??
    null;

  const handleRunSampleFromInspector = async () => {
    if (sending) return;
    const sample = 'Get me Kite Hill yogurt under $6 in Mountain View';
    const now = Date.now();
    const userMsg: ChatMessage = {
      id: `msg_u_${now}`,
      role: 'user',
      content: sample,
      timestamp: new Date().toISOString(),
    };
    const assistantId = `msg_a_${now}`;
    const streamingMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, streamingMsg]);
    setSending(true);

    const callbacks = {
      onTraceUpdate: ({
        trace,
        matches,
        pendingReservation,
      }: Parameters<NonNullable<Parameters<typeof streamAgentChat>[2]['onTraceUpdate']>>[0]) => {
        setSelectedTraceId(trace.id);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, trace, matches, pendingReservation }
              : m,
          ),
        );
      },
      onToken: (chunk: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `${m.content}${chunk}` }
              : m,
          ),
        );
      },
      onDone: ({
        reply,
        matches,
        pendingReservation,
        trace,
      }: Parameters<NonNullable<Parameters<typeof streamAgentChat>[2]['onDone']>>[0]) => {
        setSelectedTraceId(trace.id);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: reply || m.content,
                  matches,
                  pendingReservation,
                  trace,
                }
              : m,
          ),
        );
      },
    };

    try {
      if (runtime === 'browser_litert') {
        setLitertStatus('loading');
        setLitertError(null);
        await runLiteRtAgentChat(
          sample,
          { modelUri: litertModelUri, accessToken: litertToken || undefined },
          callbacks,
        );
        setLitertStatus('ready');
      } else {
        await streamAgentChat(sample, [], callbacks);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to execute sample query.';
      if (runtime === 'browser_litert') {
        setLitertStatus('error');
        setLitertError(msg);
      }
      setGlobalError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        user={user}
        authLoading={authLoading}
        onSignIn={() => void handleSignIn()}
        onSignOut={() => void handleSignOut()}
      />

      {globalError && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs text-rose-800 flex items-center justify-between gap-4">
          <span>{globalError}</span>
          <button
            type="button"
            onClick={() => setGlobalError(null)}
            className="font-medium underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="flex-1">
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:h-[calc(100vh-3.5rem)]">
            <CopilotSimulator
              user={user}
              isLiveSeeded={isLiveSeeded}
              seeding={seeding}
              reservations={reservations}
              onSeedCatalog={handleSeedCatalog}
              onSignIn={handleSignIn}
              onReserveOffer={handleReserveOffer}
              onOpenCatalogTab={() => setActiveTab('catalog')}
              messages={messages}
              setMessages={setMessages}
              selectedTraceId={selectedTraceId}
              setSelectedTraceId={setSelectedTraceId}
              sending={sending}
              setSending={setSending}
              runtime={runtime}
              onChangeRuntime={setRuntime}
              litertModelUri={litertModelUri}
              onChangeLitertModelUri={handleChangeLitertModelUri}
              litertToken={litertToken}
              onChangeLitertToken={setLitertToken}
              litertStatus={litertStatus}
              litertError={litertError}
              onInitLitert={handleInitLitert}
              onLitertStatusChange={(status, error = null) => {
                setLitertStatus(status);
                setLitertError(error);
              }}
            />
            <TraceInspector
              trace={selectedTrace}
              isLoading={sending}
              onRunSample={() => void handleRunSampleFromInspector()}
            />
          </div>
        )}

        {activeTab === 'catalog' && (
          <CatalogGraphView
            user={user}
            catalog={catalog}
            isLiveSeeded={isLiveSeeded}
            loading={catalogLoading}
            seeding={seeding}
            reservations={reservations}
            onSignIn={handleSignIn}
            onSeedCatalog={handleSeedCatalog}
            onRefreshCatalog={loadCatalog}
            onSaveOffer={handleSaveOffer}
            onCancelReservation={handleCancelReservation}
          />
        )}

        {activeTab === 'architecture' && <ArchitectureView />}

        {activeTab === 'prd' && <PrdView user={user} />}
      </main>
    </div>
  );
}
