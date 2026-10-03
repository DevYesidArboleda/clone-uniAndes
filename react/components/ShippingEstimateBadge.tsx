import React, { memo, useMemo } from 'react'
import { useQuery } from 'react-apollo'
import { useProduct } from 'vtex.product-context'
import { useCssHandles } from 'vtex.css-handles'
import { OrderForm } from 'vtex.order-manager'
import { useRuntime } from 'vtex.render-runtime'

import ESTIMATE_SHIPPING from '../graphql/estimateShipping.graphql'

const { useOrderForm } = OrderForm

const CSS_HANDLES = [
  'container',
  'title',
  'estimate',
  'carrier',
  'price',
  'loading',
  'error',
] as const

const FALLBACK_POSTAL_CODE = '110111'

// TODO #3 (resuelto): `showCarrierName` es opcional y su valor por defecto
// (false) se define tanto en la desestructuración como en defaultProps.
interface Props {
  title?: string
  showCarrierName?: boolean
  fallbackPostalCode?: string
  useDemoService?: boolean
  /** ID del endpoint de DummyJSON (https://dummyjson.com/c/<ID>). */
  demoEndpointId?: string
  blockClass?: string
}

type ComponentSchema = Record<string, unknown>

interface StorefrontComponent<P = Record<string, unknown>> extends React.FC<P> {
  schema?: ComponentSchema
}

interface ShippingEstimate {
  carrierName: string
  estimatedDays: number
  price: number
}

interface QueryData {
  estimateShipping: ShippingEstimate[]
}

interface QueryVariables {
  productId: string
  postalCode: string
  demo: boolean
  demoEndpointId: string
}

interface EstimateProps {
  productId: string
  postalCode: string
  title: string
  showCarrierName: boolean
  demo: boolean
  demoEndpointId: string
  locale: string
  currency: string
}

// TODO #7 (resuelto): optimización de renders.
//  - Esta parte (query + vista) está envuelta en React.memo y solo recibe
//    valores primitivos: cambiar de SKU dentro del mismo producto no la
//    vuelve a renderizar ni dispara una nueva consulta.
//  - La transportadora más rápida se calcula con useMemo y sin `.sort()`,
//    que mutaba el arreglo guardado en la caché de Apollo (efecto colateral).
//  - El formateador de moneda se crea una sola vez por locale/moneda.
const ShippingEstimateContent = memo(function ShippingEstimateContent({
  productId,
  postalCode,
  title,
  showCarrierName,
  demo,
  demoEndpointId,
  locale,
  currency,
}: EstimateProps) {
  const { handles } = useCssHandles(CSS_HANDLES)

  const { data, loading, error } = useQuery<QueryData, QueryVariables>(
    ESTIMATE_SHIPPING,
    {
      variables: { productId, postalCode, demo, demoEndpointId },
      // El estimado depende del código postal del comprador: no tiene
      // sentido resolverlo en el servidor con un código genérico.
      ssr: false,
    }
  )

  const fastest = useMemo(() => {
    const estimates = data?.estimateShipping ?? []

    return estimates.reduce<ShippingEstimate | null>(
      (best, current) =>
        !best || current.estimatedDays < best.estimatedDays ? current : best,
      null
    )
  }, [data])

  const priceFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }),
    [locale, currency]
  )

  // TODO #6 (resuelto): se atienden `loading` y `error` antes de leer los
  // datos, y si el servicio no devuelve opciones el badge no se muestra.
  if (loading) {
    return (
      <div className={`${handles.container} ${handles.loading} c-muted-2 t-small`}>
        Calculando tiempo de entrega…
      </div>
    )
  }

  if (error) {
    return (
      <div className={`${handles.container} ${handles.error} c-muted-2 t-small`}>
        No pudimos calcular el tiempo de entrega en este momento.
      </div>
    )
  }

  if (!fastest) {
    return null
  }

  const dayLabel = fastest.estimatedDays === 1 ? 'día hábil' : 'días hábiles'

  return (
    <div className={`${handles.container} t-small c-on-base`}>
      <span className={handles.title}>{title}</span>{' '}
      <strong className={handles.estimate}>
        {fastest.estimatedDays} {dayLabel}
      </strong>
      {showCarrierName && fastest.carrierName && (
        <span className={handles.carrier}> con {fastest.carrierName}</span>
      )}{' '}
      <span className={handles.price}>
        ({priceFormatter.format(fastest.price)})
      </span>
    </div>
  )
})

const ShippingEstimateBadge: StorefrontComponent<Props> = ({
  title = 'Recíbelo en',
  showCarrierName = false,
  fallbackPostalCode = FALLBACK_POSTAL_CODE,
  useDemoService = false,
  demoEndpointId = '',
}) => {
  const { culture } = useRuntime()
  const { orderForm, loading: orderFormLoading } = useOrderForm()

  // TODO #4 (resuelto): acceso seguro; fuera de un product-context o
  // mientras el producto carga, `productId` queda undefined y no se consulta.
  const productId = useProduct()?.product?.productId

  // TODO #5 (resuelto): el código postal sale de la dirección de envío del
  // orderForm del comprador; el valor configurable (o la constante) solo se usa como iltimo recurso.
  const postalCode =
    orderForm?.shippingData?.address?.postalCode?.trim() || fallbackPostalCode

  if (!productId || orderFormLoading) {
    return null
  }

  return (
    <ShippingEstimateContent
      productId={productId}
      postalCode={postalCode}
      title={title}
      showCarrierName={showCarrierName}
      demo={useDemoService}
      demoEndpointId={useDemoService ? demoEndpointId.trim() : ''}
      locale={culture?.locale ?? 'es-CO'}
      currency={culture?.currency ?? 'COP'}
    />
  )
}

ShippingEstimateBadge.defaultProps = {
  title: 'Recíbelo en',
  showCarrierName: false,
  fallbackPostalCode: FALLBACK_POSTAL_CODE,
  useDemoService: false,
  demoEndpointId: '',
}

ShippingEstimateBadge.schema = {
  title: 'Shipping Estimate Badge',
  description:
    'Muestra el tiempo estimado de entrega, la transportadora y el costo de envío del producto',
  type: 'object',
  properties: {
    title: {
      title: 'Texto inicial',
      type: 'string',
      default: 'Recíbelo en',
    },
    showCarrierName: {
      title: 'Mostrar nombre de la transportadora',
      type: 'boolean',
      default: false,
    },
    fallbackPostalCode: {
      title:
        'Código postal por defecto (se usa si el comprador no tiene dirección)',
      type: 'string',
      default: FALLBACK_POSTAL_CODE,
    },
    useDemoService: {
      title: 'Modo demo (usar servicio de envíos de prueba)',
      description:
        'El servicio de envíos del challenge no existe. Actívalo para ver el badge con datos de prueba.',
      type: 'boolean',
      default: false,
    },
    demoEndpointId: {
      title: 'ID del endpoint de prueba en DummyJSON (opcional)',
      description:
        'Si lo dejas vacío se usan datos de ejemplo internos. Ej: para https://dummyjson.com/c/ab12-cd34 escribe ab12-cd34',
      type: 'string',
      default: '',
    },
  },
}

export default ShippingEstimateBadge