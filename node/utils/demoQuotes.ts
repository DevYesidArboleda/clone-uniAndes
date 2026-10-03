import type { ShippingQuote } from '../clients'

export function getDemoQuotes(productId: string, postalCode: string): ShippingQuote[] {
  const isBogota = postalCode.startsWith('11')
  const extraDays = isBogota ? 0 : 2
  const variation = (Number(productId.replace(/\D/g, '')) || 0) % 3

  return [
    { carrier: 'Servientrega', days: 3 + extraDays, cost: 12000 + variation * 1000 },
    { carrier: 'Coordinadora', days: 4 + extraDays, cost: 9500 + variation * 500 },
    { carrier: 'Envía', days: 2 + extraDays, cost: 18000 + variation * 1500 },
  ]
}