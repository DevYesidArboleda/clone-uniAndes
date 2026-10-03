import { method, Service } from '@vtex/api'
import type { ParamsContext, RecorderState } from '@vtex/api'

import { Clients } from './clients'
import { health } from './middlewares/health'
import { estimateShipping } from './resolvers/estimateShipping'

export default new Service<Clients, RecorderState, ParamsContext>({
  clients: {
    implementation: Clients,
    options: {
      default: {
        // Sin reintentos y con timeout corto: el service.json corta en 2 s y
        // ante una falla preferimos responder con el fallback del resolver.
        retries: 0,
        timeout: 2000,
      },
    },
  },
  routes: {
    health: method({
      GET: [health],
    }),
  },
  graphql: {
    resolvers: {
      Query: {
        estimateShipping,
      },
    },
  },
})
