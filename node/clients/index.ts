import { ExternalClient, IOClients } from '@vtex/api'
import type { InstanceOptions, IOContext } from '@vtex/api'

/**
 * Respuesta del servicio externo de cotización de envíos (simulado).
 * Ejemplo:
 *   GET /api/quotes?productId=123&postalCode=110111
 *   [{ "carrier": "Servientrega", "days": 3, "cost": 12000 }, ...]
 */
export interface ShippingQuote {
  carrier: string
  days: number
  cost: number
}

/**
 * Tiempo máximo por llamada. Debe quedar por debajo del timeout del servicio
 * (service.json → "timeout": 2 segundos) para que el resolver alcance a
 * responder con el fallback en vez de que la plataforma corte la petición.
 */
export const QUOTES_TIMEOUT_MS = 1500
export const PING_TIMEOUT_MS = 1000

export class ShippingMockClient extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super('http://shipping-mock.example.com', context, {
      ...options,
      headers: {
        ...options?.headers,
        'X-Vtex-Use-Https': 'true',
      },
    })
  }

  public getQuotes(productId: string, postalCode: string) {
    return this.http.get<ShippingQuote[]>('/api/quotes', {
      params: { productId, postalCode },
      metric: 'shipping-mock-get-quotes',
      timeout: QUOTES_TIMEOUT_MS,
    })
  }

  public ping() {
    return this.http.get<{ ok: boolean }>('/health', {
      metric: 'shipping-mock-ping',
      timeout: PING_TIMEOUT_MS,
    })
  }
}

/**
 * Servicio de prueba para el modo demo: DummyJSON "custom response"
 * (https://dummyjson.com/custom-response). Es gratuito, no requiere cuenta y
 * devuelve el JSON que uno mismo define. Solo se usa si se activa el modo demo
 * desde el Site Editor. El host queda fijo aqui (el front solo envía el ID),
 * asi nadie puede usar este servicio para llamar a otras URLs.
 *
 * Formato aceptado: el mismo arreglo del servicio real, o { "quotes": [...] }.
 */
export class DemoShippingClient extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super('http://dummyjson.com', context, {
      ...options,
      headers: {
        ...options?.headers,
        'X-Vtex-Use-Https': 'true',
      },
    })
  }

  public async getQuotes(endpointId: string): Promise<unknown> {
    const response = await this.http.get<unknown>(
      `/c/${encodeURIComponent(endpointId)}`,
      {
        metric: 'demo-shipping-get-quotes',
        timeout: QUOTES_TIMEOUT_MS,
      }
    )

    if (response && !Array.isArray(response) && typeof response === 'object') {
      return (response as { quotes?: unknown }).quotes
    }

    return response
  }
}

export class Clients extends IOClients {
  public get shippingMock() {
    return this.getOrSet('shippingMock', ShippingMockClient)
  }

  public get demoShipping() {
    return this.getOrSet('demoShipping', DemoShippingClient)
  }
}