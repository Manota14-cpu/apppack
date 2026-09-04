import "server-only";

/**
 * Traducción entre el catálogo de la tienda y el vocabulario de AppPack.
 *
 * AppPack trabaja sobre la MISMA tabla `Product` que muestra la web, así que
 * no hay catálogo duplicado. Las columnas de la tienda están en inglés
 * (`stockAvailable`, `price`…) y la interfaz de AppPack habla en castellano,
 * por eso cada consulta las renombra al seleccionarlas.
 *
 * Se hace acá, con alias explícitos en el SELECT, y no con vistas en la base:
 * así la correspondencia se lee junto a la consulta y no hay una capa de
 * traducción invisible.
 */
export const CAMPOS_PRODUCTO = `
  p.id,
  p.name                                        as nombre,
  p.description                                 as descripcion,
  p.sku,
  p.barcode                                     as codigo_barras,
  p."categoryId"                                as categoria_id,
  p.unit                                        as unidad_medida,
  coalesce(p."costPrice", 0)                    as precio_costo,
  p.price                                       as precio_venta,
  p."stockAvailable"                            as stock,
  p."minStock"                                  as stock_minimo,
  p.active                                      as activo,
  p.slug,
  p."createdAt"                                 as created_at,
  p."updatedAt"                                 as updated_at,
  -- Campos que la tienda muestra al cliente. Volvieron a ser editables tras
  -- quedar sin dueño cuando se retiró el editor de productos de la web.
  p."longDescription"                           as descripcion_larga,
  p.features                                    as caracteristicas,
  p."oldPrice"                                  as precio_anterior,
  p.discount                                    as descuento,
  p."weightGrams"                               as peso_gramos,
  p.dimensions                                  as dimensiones,
  p.featured                                    as destacado,
  p."bestSeller"                                as mas_vendido,
  p."isNew"                                     as es_nuevo,
  p.rating                                      as puntuacion,
  p."minWholesaleQty"                           as cantidad_mayorista_min,
  p."wholesalePrice"                            as precio_mayorista,
  p."metaTitle"                                 as meta_titulo,
  p."metaDescription"                           as meta_descripcion,
  p.icon                                        as icono,
  p."stockReserved"                             as stock_reservado,
  (select count(*)::int from "ProductImage" i where i."productId" = p.id) as imagenes,
  jsonb_build_object('nombre', c.name, 'color', null) as categorias
`;

export const DESDE_PRODUCTOS = `
  from "Product" p
  join "Category" c on c.id = p."categoryId"
`;

export const CAMPOS_MOVIMIENTO = `
  m.id,
  m."productId"      as producto_id,
  m.type             as tipo,
  m.quantity         as cantidad,
  m."resultingStock" as stock_resultante,
  m.reason           as motivo,
  m."createdAt"      as created_at,
  jsonb_build_object('nombre', p.name, 'sku', p.sku) as productos
`;

export const DESDE_MOVIMIENTOS = `
  from "StockMovement" m
  join "Product" p on p.id = m."productId"
`;

export const CAMPOS_PEDIDO = `
  o.id,
  o.number            as numero,
  o.channel           as canal,
  o.status            as estado,
  o."tipoCliente"     as tipo_cliente,
  o.nombre,
  o."razonSocial"     as razon_social,
  o."dniCuit"         as dni_cuit,
  o."requiereFactura" as requiere_factura,
  o.telefono,
  o.email,
  o.direccion,
  o.localidad,
  o.provincia,
  o.notas,
  o.total,
  -- Solo lo llevan las ventas de mostrador; en un pedido de la web es nulo.
  o."paymentMethod"   as metodo_pago,
  o."sessionId"       as caja_id,
  o."createdAt"       as created_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'producto_id', i."productId", 'nombre', i.name,
             'unidad_medida', i.unit, 'precio', i.price, 'cantidad', i.quantity
           ) order by i.name)
      from "OrderItem" i where i."orderId" = o.id
  ), '[]'::jsonb) as items
`;

/** Escapa los comodines de un LIKE para que el usuario pueda buscar "%" o "_". */
export function paraBusqueda(termino: string): string {
  return `%${termino.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}
