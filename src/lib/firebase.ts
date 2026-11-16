import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  collectionGroup,
  doc,
  getDocFromServer,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { SEED_OFFERS, SEED_PRODUCTS } from '../data/seedCatalog.ts';
import type {
  AvailabilityStatus,
  MerchantControls,
  Offer,
  Product,
  ProductWithOffers,
  Reservation,
} from '../types/commerce.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
] as const;

const googleProvider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  googleProvider.addScope(scope);
}

const docsAuthProvider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  docsAuthProvider.addScope(scope);
}

// In-memory cache only (never persisted to localStorage or sessionStorage)
let cachedGoogleAccessToken: string | null = null;

onAuthStateChanged(auth, (currentUser) => {
  if (!currentUser) {
    cachedGoogleAccessToken = null;
  }
});

async function tokenHasDocsScope(accessToken: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!resp.ok) return false;
    const info = (await resp.json()) as { scope?: string };
    const granted = (info.scope ?? '').split(/\s+/);
    return (
      granted.includes('https://www.googleapis.com/auth/documents') ||
      granted.includes('https://www.googleapis.com/auth/drive') ||
      granted.includes('https://www.googleapis.com/auth/drive.file')
    );
  } catch {
    // If tokeninfo check is blocked offline/by CSP, let the Docs API validate directly
    return true;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken && (await tokenHasDocsScope(credential.accessToken))) {
    cachedGoogleAccessToken = credential.accessToken;
  }
  return result.user;
}

export async function authorizeGoogleDocs(): Promise<{ user: User; accessToken: string }> {
  const customParams: Record<string, string> = {
    prompt: 'consent',
    include_granted_scopes: 'true',
  };
  if (auth.currentUser?.email) {
    customParams.login_hint = auth.currentUser.email;
  }
  docsAuthProvider.setCustomParameters(customParams);

  const result = await signInWithPopup(auth, docsAuthProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Google Docs access permission was not granted.');
  }

  const hasScope = await tokenHasDocsScope(credential.accessToken);
  if (!hasScope) {
    cachedGoogleAccessToken = null;
    throw new Error(
      'Google Docs permission was not checked on the Google consent screen. Please click "Confirm & Create Doc" again and select the checkbox to allow Google Docs access.',
    );
  }

  cachedGoogleAccessToken = credential.accessToken;
  return { user: result.user, accessToken: credential.accessToken };
}

export function getGoogleDocsAccessToken(): string | null {
  return cachedGoogleAccessToken;
}

export function clearGoogleDocsAccessToken(): void {
  cachedGoogleAccessToken = null;
}

export async function signOutUser(): Promise<void> {
  cachedGoogleAccessToken = null;
  await signOut(auth);
}

export async function fetchCatalogGraph(): Promise<{
  products: ProductWithOffers[];
  isLiveSeeded: boolean;
}> {
  const productsPath = 'products';
  const offersPath = 'offers';

  const [productSnap, offersGroupSnap] = await Promise.all([
    getDocs(collection(db, productsPath)).catch((error) =>
      handleFirestoreError(error, OperationType.LIST, productsPath),
    ),
    getDocs(collectionGroup(db, offersPath)).catch((error) =>
      handleFirestoreError(error, OperationType.LIST, offersPath),
    ),
  ]);

  if (productSnap.empty) {
    return { products: [], isLiveSeeded: false };
  }

  const offersByProduct = new Map<string, Offer[]>();
  for (const offerDoc of offersGroupSnap.docs) {
    const offer = offerDoc.data() as Offer;
    const list = offersByProduct.get(offer.productId) ?? [];
    list.push(offer);
    offersByProduct.set(offer.productId, list);
  }

  const productsWithOffers: ProductWithOffers[] = productSnap.docs.map((prodDoc) => {
    const productData = prodDoc.data() as Product;
    const offers = offersByProduct.get(prodDoc.id) ?? [];
    offers.sort((a, b) => a.price - b.price);
    return {
      ...productData,
      offers,
    };
  });

  productsWithOffers.sort((a, b) => a.name.localeCompare(b.name));
  return { products: productsWithOffers, isLiveSeeded: true };
}

export async function seedCatalogToFirestore(ownerId: string): Promise<void> {
  if (!ownerId) {
    throw new Error('Authentication required to seed Firestore catalog.');
  }

  try {
    const existingProductsSnap = await getDocs(collection(db, 'products'));
    const existingProductIds = new Set(existingProductsSnap.docs.map((d) => d.id));

    const existingOfferKeys = new Set<string>();
    await Promise.all(
      existingProductsSnap.docs.map(async (prodDoc) => {
        const offersSnap = await getDocs(collection(db, `products/${prodDoc.id}/offers`));
        for (const o of offersSnap.docs) {
          existingOfferKeys.add(`${prodDoc.id}/${o.id}`);
        }
      }),
    );

    const batch = writeBatch(db);
    for (const product of SEED_PRODUCTS) {
      const productRef = doc(db, 'products', product.id);
      if (existingProductIds.has(product.id)) {
        batch.update(productRef, {
          name: product.name,
          brand: product.brand,
          category: product.category,
          description: product.description,
          unit_size: product.unit_size,
          gtin: product.gtin,
          dietary_tags: product.dietary_tags,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(productRef, {
          ...product,
          ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const offer of SEED_OFFERS) {
      const offerRef = doc(db, `products/${offer.productId}/offers`, offer.id);
      if (existingOfferKeys.has(`${offer.productId}/${offer.id}`)) {
        batch.update(offerRef, {
          price: offer.price,
          availability_status: offer.availability_status,
          stock_count: offer.stock_count,
          merchant_controls: offer.merchant_controls,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(offerRef, {
          ...offer,
          ownerId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

export async function updateOfferInFirestore(
  productId: string,
  offerId: string,
  updates: {
    price: number;
    availability_status: AvailabilityStatus;
    stock_count: number;
    merchant_controls: MerchantControls;
  },
): Promise<void> {
  const path = `products/${productId}/offers/${offerId}`;
  const offerRef = doc(db, `products/${productId}/offers`, offerId);
  const sanitizedPrice = Math.max(0.01, Math.min(10000, Number(updates.price)));
  const sanitizedStock = Math.max(0, Math.min(100000, Math.round(Number(updates.stock_count))));
  const sanitizedControls: MerchantControls = {
    agent_checkout_allowed: Boolean(updates.merchant_controls.agent_checkout_allowed),
    max_quantity_per_order: Math.max(
      1,
      Math.min(50, Math.round(Number(updates.merchant_controls.max_quantity_per_order))),
    ),
    requires_confirmation: Boolean(updates.merchant_controls.requires_confirmation),
    fulfillment_methods:
      updates.merchant_controls.fulfillment_methods.length > 0
        ? updates.merchant_controls.fulfillment_methods.slice(0, 5)
        : ['pickup'],
  };

  try {
    await updateDoc(offerRef, {
      price: sanitizedPrice,
      availability_status: updates.availability_status,
      stock_count: sanitizedStock,
      merchant_controls: sanitizedControls,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createReservationInFirestore(input: {
  userId: string;
  productId: string;
  offerId: string;
  productName: string;
  merchantName: string;
  location: string;
  price: number;
  quantity: number;
}): Promise<Reservation> {
  const reservationId = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `reservations/${reservationId}`;
  const reservationRef = doc(db, 'reservations', reservationId);
  const offerRef = doc(db, `products/${input.productId}/offers`, input.offerId);
  const qty = Math.max(1, Math.min(50, Math.round(input.quantity)));

  const payload = {
    id: reservationId,
    userId: input.userId,
    productId: input.productId,
    offerId: input.offerId,
    productName: input.productName.slice(0, 160),
    merchantName: input.merchantName.slice(0, 100),
    location: input.location.slice(0, 100),
    price: Number(input.price),
    quantity: qty,
    status: 'reserved' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await runTransaction(db, async (tx) => {
      const offerSnap = await tx.get(offerRef);
      if (!offerSnap.exists()) {
        throw new Error('Selected merchant offer no longer exists in Firestore.');
      }

      const offerData = offerSnap.data() as Offer;
      if (offerData.availability_status === 'out_of_stock' || offerData.stock_count < qty) {
        throw new Error('Offer is out of stock or has insufficient remaining inventory.');
      }
      if (!offerData.merchant_controls.agent_checkout_allowed) {
        throw new Error('Merchant controls currently block autonomous agent checkout for this offer.');
      }

      tx.set(reservationRef, payload);

      const canMutateOffer =
        offerData.ownerId === input.userId ||
        (auth.currentUser?.email === 'somdatta46@gmail.com' &&
          auth.currentUser?.emailVerified === true);

      if (canMutateOffer) {
        const nextStock = Math.max(0, offerData.stock_count - qty);
        const nextStatus: AvailabilityStatus =
          nextStock === 0 ? 'out_of_stock' : nextStock <= 3 ? 'low_stock' : 'in_stock';
        tx.update(offerRef, {
          stock_count: nextStock,
          availability_status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
    });

    return {
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      !error.message.toLowerCase().includes('permission')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchUserReservations(userId: string): Promise<Reservation[]> {
  const path = 'reservations';
  try {
    const q = query(
      collection(db, path),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Reservation);
  } catch (error) {
    // Fallback if composite index on userId + createdAt hasn't been created yet
    try {
      const qSimple = query(collection(db, path), where('userId', '==', userId));
      const snap = await getDocs(qSimple);
      return snap.docs.map((d) => d.data() as Reservation);
    } catch (innerErr) {
      handleFirestoreError(innerErr, OperationType.LIST, path);
    }
  }
}

export async function cancelReservationInFirestore(reservationId: string): Promise<void> {
  const path = `reservations/${reservationId}`;
  const ref = doc(db, 'reservations', reservationId);
  try {
    await updateDoc(ref, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
