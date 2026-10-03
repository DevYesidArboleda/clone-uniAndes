import type { ServiceContext } from '@vtex/api'

import type { Clients } from '../clients'

type Context = ServiceContext<Clients>

// TODO #10: este endpoint maneja mal los status codes y el body.
//  - Cuando el servicio externo responde, debería devolver 200.
//  - Cuando no responde, debería devolver 503 (no 200).
//  - En ambos casos el body debe ser un JSON válido y consistente.
// TODO #10 (resuelto):
//  - 200 cuando el servicio externo responde, 503 cuando no.
//  - El body siempre es JSON con la misma forma; en caso de error solo se
//    expone un mensaje corto (nunca el objeto de error completo, que puede
//    no ser serializable y filtrar detalles internos).
//  - No se cachea: un health check debe reflejar el estado actual.
export async function health(ctx: Context, next: () => Promise<unknown>) {
  const checkedAt = new Date().toISOString()

  ctx.set('Cache-Control', 'no-cache, no-store')

  try {
    const response = await ctx.clients.shippingMock.ping()

    if (response?.ok === false) {
      throw new Error('Shipping service reported ok: false')
    }

    ctx.status = 200
    ctx.body = {
      status: 'up',
      dependencies: { shippingMock: 'up' },
      checkedAt,
    }
  } catch (error) {
    ctx.vtex.logger.warn({
      message: 'health: shipping service unreachable',
      error: error instanceof Error ? error.message : String(error),
    })

    ctx.status = 503
    ctx.body = {
      status: 'down',
      dependencies: { shippingMock: 'down' },
      checkedAt,
      error: 'Shipping service is unreachable',
    }
  }

  await next()
}