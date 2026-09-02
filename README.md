# AppPack — Panel de stock de Pack Distribuidora

Panel interno para administrar el catálogo y el stock de la tienda: crear y editar productos, organizarlos por categoría, registrar entradas y salidas con su motivo, ver alertas de reposición e importar o exportar el catálogo en Excel.

## Un solo catálogo

AppPack **administra la misma tabla `Product` que muestra la web**. No hay catálogo duplicado ni sincronización: lo que se cambia acá es lo que ve el cliente.

```
AppPack  ─┐
          ├─→  neondb · tabla Product  ─→  packdistribuidora.com
Tienda   ─┘         (una sola verdad)
```

Los cambios aparecen en la web **en menos de un minuto** (las páginas se cachean 60 s, `PRODUCT_REVALIDATE` en la tienda). Bajar el stock a 0 hace que el sitio muestre *"Sin stock"* y deshabilite el botón *Agregar*.

Como consecuencia, el editor de productos de la tienda (`/admin/productos`) quedó **en modo consulta**: tener dos lugares para editar lo mismo era la vía segura para que los números se contradijeran.

## Arranque

```bash
cp .env.example .env.local     # completar DATABASE_URL y ADMIN_PASSWORD
npm install
npm run db:setup               # agrega las funciones de stock al catálogo
npm run dev
```

`db:setup` es idempotente. `npm run db:check` informa qué piezas existen y cuáles faltan.

## Stack

- **Next.js 16** (App Router) + **React 19** + TypeScript estricto
- **PostgreSQL** en Neon (`sa-east-1`), vía el driver `pg` con conexión directa
- **Tailwind CSS 3** con tokens de color verificados contra WCAG AA
- **Radix UI** · **Recharts** · **Framer Motion** · **Lucide**
- **Zod** para validar toda entrada · **ExcelJS** para importar y exportar
- **Vitest** · **ESLint** con `next/core-web-vitals`

## Cómo está organizado

| Ruta | Qué hace |
| --- | --- |
| `/dashboard` | Métricas del inventario, alertas de reposición, movimientos recientes |
| `/productos` | Catálogo con búsqueda, filtros, alta/edición, entradas y salidas |
| `/movimientos` | Historial completo de movimientos, filtrable |
| `/configuracion` | Estado de la base, backup en JSON, cierre de sesión |

Las páginas son Server Components que consultan la base; la interacción vive en los `*-client.tsx`. Búsqueda, filtros y paginación se resuelven **en Postgres** y viajan en la URL para poder compartirse.

## Decisiones que conviene conocer

**Vocabulario.** El catálogo de la tienda está en inglés (`stockAvailable`, `price`, `minStock`) y la interfaz de AppPack habla en castellano. La correspondencia está en `lib/sql.ts`, con alias explícitos en cada `SELECT` — a propósito, en vez de vistas en la base, para que se lea junto a la consulta y no haya una capa de traducción invisible.

**Acceso.** Una sola contraseña (`ADMIN_PASSWORD`). Cada login emite un token aleatorio firmado con HMAC que vence a las 12 horas — no es un hash de la contraseña, así que la cookie no equivale a la contraseña. Cambiar `ADMIN_PASSWORD` o `SESSION_SECRET` invalida todas las sesiones. El login tiene límite de intentos con bloqueo escalonado.

**Autorización.** Toda lectura y toda Server Action llama primero a `requerirSesion()` (`lib/guard.ts`). La cadena de conexión vive solo en el servidor y nunca llega al navegador.

**Stock.** Nunca se escribe directo. Todo cambio pasa por la función `ajustar_stock`, que bloquea la fila (`FOR UPDATE`), valida que no quede negativo, actualiza `Product.stockAvailable` y registra el movimiento en la misma transacción. La importación de Excel también la respeta y corre entera dentro de una transacción. Por eso el campo Stock está deshabilitado al editar un producto.

**Enteros.** La tienda guarda precios y stock como enteros (pesos sin centavos, unidades completas), así que AppPack redondea al validar.

**Números desde Postgres.** `numeric` y `bigint` llegan como texto. `lib/db.ts` registra parsers para convertirlos a `number` una sola vez; sin eso, `stock <= minStock` compararía strings (`"9" > "10"` da `true`).

**Campos que la tienda exige.** `Product` pide `slug`, `description` y categoría; `Category` pide `slug`, `icon` y `description`. Las funciones `crear_producto` y `crear_categoria` los completan solas (el slug se genera del nombre y se desambigua). Después se afinan desde la tienda.

**Eliminar es reversible.** «Eliminar» marca `active = false`, lo que además lo saca de la web. Se recupera desde el filtro **Eliminados**; el historial se conserva siempre.

## Comandos

```bash
npm run dev        # desarrollo
npm run build      # build de producción
npm run typecheck  # TypeScript
npm run lint       # ESLint
npm run test       # Vitest
npm run db:setup   # aplicar las funciones de stock
npm run db:check   # verificar el esquema
```

## Pendiente conocido

Cuando entra un pedido en la web, `src/app/api/orders/route.ts` incrementa `stockReserved`, **que nadie lee y nunca se descuenta**: `stockAvailable` no baja al vender. O sea que el circuito está cerrado en una sola dirección (AppPack → web) pero no en la otra. Falta que la venta descuente stock y deje su movimiento; es el próximo paso natural.

## Estado de seguridad

`npm audit` sobre dependencias de producción: **0 críticas, 0 altas**. Queda un aviso moderado en `uuid`, dependencia transitiva de ExcelJS, que afecta a los generadores v3/v5/v6 cuando se les pasa un buffer — ExcelJS usa v4 sin buffer, así que no es alcanzable.
