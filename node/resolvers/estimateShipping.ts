import { LRUCache, UserInputError } from '@vtex/api'
import type { ServiceContext } from '@vtex/api'

import type { Clients, ShippingQuote } from '../clients'
import { QUOTES_TIMEOUT_MS } from '../clients'
import { getDemoQuotes } from '../utils/demoQuotes'

type Context = ServiceContext<Clients>

export interface EstimateShippingArgs {
  productId: string
  postalCode: string
  demo?: boolean | null
  demoEndpointId?: string | null
}

export interface ShippingEstimate {
  carrierName: string
  estimatedDays: number
  price: number
}

interface CacheEntry {
  value: ShippingEstimate[]
  freshUntil: number
}


export const FRESH_TTL_MS = 10 * 60 * 1000
export const EMPTY_TTL_MS = 60 * 1000
export const STALE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 5000

export const RESOLVER_TIMEOUT_MS = QUOTES_TIMEOUT_MS + 300

let cache = new LRUCache<string, CacheEntry>({ max: MAX_ENTRIES })

const inFlight = new Map<string, Promise<ShippingEstimate[]>>()

export function resetShippingCache() {
  cache = new LRUCache<string, CacheEntry>({ max: MAX_ENTRIES })
  inFlight.clear()
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Shipping quotes timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

function isValidQuote(quote: unknown): quote is ShippingQuote {
  if (!quote || typeof quote !== 'object') return false
  const { carrier, days, cost } = quote as Record<string, unknown>

  return (
    typeof carrier === 'string' &&
    carrier.trim().length > 0 &&
    typeof days === 'number' &&
    Number.isFinite(days) &&
    days >= 0 &&
    typeof cost === 'number' &&
    Number.isFinite(cost) &&
    cost >= 0
  )
}

export function toEstimates(quotes: unknown): ShippingEstimate[] {
  if (!Array.isArray(quotes)) return []

  return quotes
    .filter(isValidQuote)
    .map((quote) => ({
      carrierName: quote.carrier.trim(),
      estimatedDays: Math.ceil(quote.days),
      price: quote.cost,
    }))
    .sort((a, b) => a.estimatedDays - b.estimatedDays || a.price - b.price)
}

function normalizeArgs(args: EstimateShippingArgs) {
  const productId = String(args?.productId ?? '').trim()
  const postalCode = String(args?.postalCode ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase()

  if (!productId) {
    throw new UserInputError('productId is required')
  }

  if (!/^[A-Z0-9]{3,10}$/.test(postalCode)) {
    throw new UserInputError('postalCode is invalid')
  }

  const demo = Boolean(args?.demo)
  const demoEndpointId = String(args?.demoEndpointId ?? '').trim()

  if (demoEndpointId && !/^[A-Za-z0-9-]{4,64}$/.test(demoEndpointId)) {
    throw new UserInputError('demoEndpointId is invalid')
  }

  return { productId, postalCode, demo, demoEndpointId }
}

interface QuoteSource {
  cacheScope: string
  fetch: () => Promise<unknown>
  fallback: () => ShippingEstimate[]
}

function resolveSource(
  ctx: Context,
  productId: string,
  postalCode: string,
  demo: boolean,
  demoEndpointId: string
): QuoteSource {
  if (!demo) {
    return {
      cacheScope: 'live',
      fetch: () => ctx.clients.shippingMock.getQuotes(productId, postalCode),
      fallback: () => [],
    }
  }

  // Modo demo: si falla el servicio de prueba (o no hay ID)
  const sample = () => toEstimates(getDemoQuotes(productId, postalCode))

  if (!demoEndpointId) {
    return {
      cacheScope: 'demo-local',
      fetch: async () => getDemoQuotes(productId, postalCode),
      fallback: sample,
    }
  }

  return {
    cacheScope: `demo:${demoEndpointId}`,
    fetch: () => ctx.clients.demoShipping.getQuotes(demoEndpointId),
    fallback: sample,
  }
}

async function fetchEstimates(source: QuoteSource) {
  const quotes = await withTimeout(source.fetch(), RESOLVER_TIMEOUT_MS)

  return toEstimates(quotes)
}

// TODO #8 (resuelto): la firma recibe { productId, postalCode } tipados.
// TODO #9 (resuelto): timeout, manejo de errores, fallback y caching.
export const estimateShipping = async (
  _root: unknown,
  args: EstimateShippingArgs,
  ctx: Context
): Promise<ShippingEstimate[]> => {
  const { productId, postalCode, demo, demoEndpointId } = normalizeArgs(args)
  const source = resolveSource(ctx, productId, postalCode, demo, demoEndpointId)
  const key = `${source.cacheScope}:${productId}:${postalCode}`
  const now = Date.now()
  const cached = cache.get(key) || undefined

  if (cached && cached.freshUntil > now) {
    return cached.value
  }

  let request = inFlight.get(key)

  if (!request) {
    request = fetchEstimates(source).finally(() => {
      inFlight.delete(key)
    })
    inFlight.set(key, request)
  }

  try {
    const estimates = await request
    const ttl = estimates.length > 0 ? FRESH_TTL_MS : EMPTY_TTL_MS

    cache.set(key, { value: estimates, freshUntil: Date.now() + ttl }, STALE_TTL_MS)

    return estimates
  } catch (error) {
    ctx.vtex.logger.warn({
      message: 'estimateShipping: shipping service failed, using fallback',
      productId,
      postalCode,
      source: source.cacheScope,
      usedStaleCache: Boolean(cached),
      error: error instanceof Error ? error.message : String(error),
    })

    return cached ? cached.value : source.fallback()
  }
}