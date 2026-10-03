# Respuestas — VTEX IO Challenge

**Nombre:**
**Tiempo aproximado invertido:**

> Para cada tarea, explica brevemente qué cambiaste y por qué. Si no alcanzaste a implementar alguna, describe cómo la resolverías.

---

## Store

### 1. Error de sintaxis en `store/blocks.jsonc`


Faltaba una coma entre las dos propiedades del bloque (`showCarrierName` y `blockClass`). Sin esa coma, el archivo no es válido y la tienda no compila. Se agregó la coma.

Además, para que la tienda no quedara vacía, se agregaron los bloques del **minimum boilerplate theme** de VTEX en la carpeta `store/blocks/`: encabezado, pie de pagina, home, búsqueda y paginas por defecto. La pagina de producto se armo con lo basico (imágenes, nombre, precio, selector de talla o color, cantidad y boton de compra). 


### 2. Interface de `shipping-estimate-badge`

el archivo venia con una extension .jsonc y era .json


---

## Componente React

El componente sigue la forma en que suelo construir mis componentes: todas las opciones tienen un valor por defecto `defaultProps` y existe un `schema` para que se puedan cambiar desde el **Site Editor** sin tocar codigo. Desde el editor se puede cambiar:

- el texto inicial ("Recíbelo en"),
- si se muestra o no el nombre de la transportadora,
- el codigo postal de respaldo,
- y el modo demo 
### Modo demo (agregado al probar en una tienda real)
https://dummyjson.com/c/c19b-c677-4d25-8fdd pasandole el ultimo codigo de esta url puedo simular datos de una trasportadora y los consulto c19b-c677-4d25-8fdd solo para mostrar algo

### 3. Tipado de `showCarrierName`

Antes era obligatoria: si alguien ponia el bloque y olvidaba configurarla, el componente fallaba. Ahora es opcional y, si nadie la configura, vale `false` (no se muestra la transportadora). Así el bloque funciona "tal cual" con solo agregarlo a la página.

### 4. Acceso seguro a `product.productId`

El codigo suponia que el producto siempre existía. Pero hay momentos en que no existe: mientras la pagina carga En esos casos la pagina se rompía.

Ahora el componente primero pregunta si existes productos y si no lo hay, simplemente no muestra nada y no hace ninguna consulta. 

### 5. Resolución de `defaultPostalCode`

El código postal estaba escrito a mano (Bogotá) para todos los compradores, así que el estimado era incorrecto para cualquiera fuera de esa ciudad.

Ahora se toma de la **direccion de envio que el comprador ya tiene en su carrito**. Solo si no tiene ninguna se usa un código de respaldo, que se puede cambiar desde el Site Editor sin desplegar codigo.


### 6. Manejo de `loading` y `error`

El codigo leia los datos sin revisar si ya habian llegado, así que fallaba mientras la consulta estaba en camino o si había un error. Ahora el badge maneja cuatro escenarios:

- **Cargando:** muestra "Calculando tiempo de entrega…".
- **Error:** muestra un mensaje discreto ("No pudimos calcular el tiempo de entrega en este momento"), sin romper la sitio.
- **Sin opciones de envio:** el badge no aparece. 
- **Con datos:** muestra la primera opciono la mas rapida.

### 7. Optimización de renders

Había tres cosas para mejorar:

1. **Un efecto secundario escondido.** Para encontrar la transportadora más rápida, el código ordenaba la lista modificando la original. Esa lista es la misma que Apollo guarda en memoria y comparte con otras partes de la página, así que alterarla puede causar errores difíciles de rastrear. Ahora solo se recorre la lista y se elige la más rápida, sin tocarla. Además, ese cálculo se guarda y solo se repite cuando llegan datos nuevos.
2. **Redibujos innecesarios.** El componente se redibujaba cada vez que cambiaba algo del producto, por ejemplo cuando el comprador elegía otra talla o color, aunque el envío fuera el mismo. Lo dividí en dos partes. Una parte liviana lee el producto y el carrito. La otra consulta el envío y dibuja el badge, y solo se actualiza si cambia el producto o el código postal. Así, cambiar de talla no redibuja el badge ni repite la consulta.
3. **El formato del precio** se prepara una sola vez, en lugar de crearse en cada redibujo, y usa la moneda y el idioma de la tienda en vez de tener pesos colombianos fijos en el código.

También se le indicó a la consulta que no se haga en el servidor al armar la página. El estimado depende del código postal de cada comprador, así que calcularlo en el servidor con un código genérico solo haría más lenta la carga inicial y mostraría un dato que luego cambia.

---

## GraphQL y Node

### 8. Argumentos en el schema y firma del resolver

El front enviaba el producto y el codigo postal, pero el servidor no los recibía: usaba valores fijos. Ahora la consulta los recibe y el resolver los usa, con sus tipos definidos para que el editor avise si algo no cuadra.

También se dejó claro en el schema que la respuesta **siempre es una lista** (aunque esté vacía) y que cada opción trae todos sus datos. Así el front no tiene que adivinar si algo puede venir vacío.

Al probar en un workspace real aparecieron dos ajustes más:

- **Quién puede usar la consulta.** La versión actual del builder de GraphQL exige declararlo. Se marcó como **pública** (`@auth(scope: PUBLIC)`), porque la usa cualquier comprador que navega la tienda y no devuelve datos personales.
- **Dónde vive la consulta del front.** El archivo `estimateShipping.graphql` estaba en la carpeta `graphql/`, pero VTEX trata todo lo que hay ahí como parte del schema del servidor, y al encontrar una consulta del front fallaba al arrancar. Se movió a `react/graphql/`, que además es la única carpeta desde donde el componente de React puede importar archivos.

### 9. Resolver: timeout, errores, fallback y caching

**Timeout (tiempo máximo de espera).** Si el servicio de envíos no responde en **1,5 segundos**, se deja de esperar. Antes el cliente podía esperar hasta 10 segundos y reintentar 2 veces, pero VTEX corta cualquier petición a los 2 segundos. En la práctica, la página se quedaba esperando y luego fallaba sin respuesta. Con 1,5 segundos queda margen para responder con el respaldo antes de ese corte. Quité los reintentos: con la caché y el respaldo de abajo, es mejor responder rápido que insistir.

**Manejo de errores.** Hay dos tipos de error y se tratan distinto:

- **Errores del servicio de envíos** (se cae, tarda o responde datos raros como días negativos o un costo que no es número): se registran en los logs para poder revisarlos, pero **nunca llegan como error a la página**. Las opciones malformadas se descartan una por una, sin perder las que sí están bien.
- **Errores de quien hace la consulta** (producto vacío o código postal mal escrito): se responde un error claro, porque ahí el problema no es del servicio y conviene que se note.

**Fallback (respaldo).** Si el servicio falla, se responde con la **última información conocida** para ese producto y código postal, aunque ya esté vieja. Un estimado de hace unas horas es mucho más útil que nada. Si nunca se tuvo información, se responde una lista vacía y el badge no aparece. La regla general: **la página de producto nunca se rompe por culpa del servicio de envíos.**

**Caching**

- **Qué se guarda:** las opciones de envío ya procesadas y listas para mostrar.
- **Con qué clave:** el producto más el código postal, que es lo único de lo que depende la cotización. El código postal se limpia antes (sin espacios ni guiones), para que "110 111" y "110111" usen la misma entrada.
- **Por cuánto tiempo:**
  - **10 minutos** si hay opciones. Los tiempos y costos de envío no cambian a cada segundo, y en ese lapso muchos compradores ven el mismo producto desde la misma zona. Así se evita llamar al servicio en cada visita.
  - **1 minuto** si la lista llega vacía. Puede ser un problema momentáneo del servicio y no quiero esconder el badge por mucho tiempo.
  - **Los errores nunca se guardan**, para que el siguiente intento vuelva a preguntar.
  - Una respuesta vencida se conserva hasta **24 horas**, pero solo para usarla como respaldo si el servicio se cae.
- **Dónde:** en la memoria del propio servicio, con un máximo de 5.000 combinaciones. Cuando se llena, se descartan las menos usadas. Elegí la memoria porque es lo más rápido de leer y el dato es temporal. Un almacenamiento compartido (como VBase) agregaría otra llamada de red justo cuando queremos responder rápido. La desventaja es que cada copia del servicio (VTEX corre entre 2 y 4) tiene su propia memoria, así que cada una llena su caché por separado. Para este caso es aceptable.
- **Visitas simultáneas:** si muchas personas abren el mismo producto al mismo tiempo, se hace **una sola** llamada al servicio y todas comparten la respuesta, en vez de saturarlo con llamadas repetidas.
- **Caché de la consulta:** además, la consulta se marcó como "guardable por poco tiempo" (`@cacheControl` PUBLIC/SHORT). Es seguro porque la respuesta no tiene datos personales: solo depende del producto y el código postal.

### 10. Health check (`health.ts`)

El health check es la dirección que un sistema de monitoreo consulta para saber si el servicio está bien. Tenía tres problemas:

- Respondía **201** cuando todo estaba bien (un código que significa "creé algo", no "todo bien").
- Respondía **200** ("todo bien") cuando el servicio estaba nadie se enteraba
- A veces devolvía texto y a veces el error completo, que puede no convertirse bien a JSON y además expone detalles internos.

Ahora:

- Responde **200** con `{ "status": "up", ... }` cuando el servicio de envíos responde.
- Responde **503** ("servicio no disponible") con `{ "status": "down", "error": "..." }` cuando no responde o dice que no está bien.
- El cuerpo siempre es JSON con la misma forma. El detalle técnico del error queda solo en los logs.
- La respuesta no se guarda en caché, para que siempre refleje el estado real del momento.
- Tiene un tiempo de espera corto (1 segundo)
---

## Notas adicionales

### Modo demo (agregado al probar en una tienda real)

El servicio de envíos del challenge no existe, así que en una tienda real el resolver siempre cae al respaldo, devuelve una lista vacía y el badge no aparece, aunque todo esté bien conectado. Para poder **ver el componente funcionando** agregué un modo demo, **apagado por defecto**, que se activa desde el Site Editor con dos opciones del bloque:

- **"Modo demo"** (sí/no): cuando está encendido, el badge usa datos de prueba en lugar del servicio real.
- **"ID del endpoint de prueba en DummyJSON"** (opcional): DummyJSON es un servicio gratuito, sin registro, donde uno pega un JSON y obtiene una dirección web que lo devuelve. Así el badge consulta una API externa de verdad, con transportadoras de ejemplo. Si se deja vacío, se usan datos de ejemplo internos.

Decisiones:

- **Seguridad:** el front solo envía el ID, nunca una dirección completa. El servidor arma la dirección de DummyJSON y solo tiene permiso para salir a ese sitio. Así nadie puede usar el app para hacer llamadas a otras páginas.
- **Siempre muestra algo:** si DummyJSON falla o el endpoint vence (duran 90 días), el modo demo usa los datos internos, para que la demostración nunca quede en blanco.
- **Sin mezclas:** los datos de prueba se guardan en caché por separado de los reales.
- **Sin efectos en el comportamiento normal:** con el modo demo apagado, el app hace exactamente lo que pide el challenge.

Antes había probado activar el modo demo desde la configuración del app en el Admin, pero lo pasé al Site Editor porque es más práctico: se prende y se apaga en la misma pantalla donde se ve el resultado.

### Ajustes necesarios para que el app compile en VTEX hoy

El starter usaba versiones antiguas de algunas piezas. Al linkear en un workspace real aparecieron errores que no estaban marcados como TODO, y los corregí:

- **Servicio Node en la versión 7.x**, que es la que VTEX usa actualmente. Seguí la guía de migración oficial y el ejemplo `service-example` de VTEX: TypeScript 5.5.3, tipos de Node 20 y la configuración base `@vtex/tsconfig`.
- **La configuración de TypeScript del starter tenía `noEmit`**, que le dice a TypeScript "revisa el código pero no generes nada". Por eso VTEX decía que no encontraba el archivo principal del servicio.
- **GraphQL en la versión 2.x**, que exige declarar quién puede usar cada consulta 

### Archivos y dependencias agregados (y por qué)

- `store/blocks/*.jsonc`: bloques del minimum boilerplate theme, para tener una tienda navegable donde ver el badge.
- `react/package.json`: se agregó `@types/node`, porque la compilación en VTEX avisaba que le faltaba.
- `node/.npmrc` y `react/.npmrc`: algunas librerías declaran compatibilidad con versiones más viejas de sus dependencias, aunque funcionan bien con las actuales.

### Mejoras que propondría con más tiempo

- Pruebas automáticas del componente React (con `@vtex/test-tools`) para cubrir los estados de carga, error y vacío.
- Textos traducibles (carpeta `messages/`) en lugar de frases fijas en español, para tiendas en varios idiomas.
- Si el tráfico creciera mucho, una caché compartida entre las copias del servicio (por ejemplo VBase) como segunda capa, detrás de la caché en memoria.
- Mostrar más de una opción de envío (por ejemplo, "la más rápida" y "la más barata"), configurable desde el Site Editor.
