-- =====================================================================
-- APPPACK — Funciones de stock sobre el catálogo de la tienda
-- =====================================================================
-- AppPack administra la MISMA tabla `Product` que muestra la web. No hay
-- catálogo duplicado ni sincronización: lo que se cambia acá es lo que ve
-- el cliente (la web cachea las páginas 60 segundos).
--
-- Las tablas (`Product`, `Category`, `StockMovement`) las gobierna Prisma
-- desde packdistribuidora/prisma/schema.prisma. Este archivo solo agrega
-- las funciones que Prisma no maneja.
--
-- Es idempotente. Aplicalo con:  npm run db:setup
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- slug a partir del nombre (la tienda lo usa en la URL del producto)
-- ---------------------------------------------------------------------
create or replace function apppack_slug(txt text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(
    lower(translate(txt,
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- Devuelve un slug libre, agregando -2, -3… si ya existe.
create or replace function apppack_slug_unico(txt text)
returns text
language plpgsql
as $$
declare
  base   text := coalesce(nullif(apppack_slug(txt), ''), 'producto');
  intento text := base;
  n int := 1;
begin
  while exists (select 1 from "Product" where slug = intento) loop
    n := n + 1;
    intento := base || '-' || n;
  end loop;
  return intento;
end;
$$;

-- ---------------------------------------------------------------------
-- Ajuste de stock: atómico y trazable
-- ---------------------------------------------------------------------
-- Bloquea la fila, valida que no quede negativo, actualiza el stock que
-- lee la web y registra el movimiento — todo en una sola transacción.
create or replace function ajustar_stock(
  p_producto_id text,
  p_cantidad    int,
  p_motivo      text,
  p_tipo        text default 'ajuste'
) returns int
language plpgsql
as $$
declare
  v_actual     int;
  v_resultante int;
begin
  select "stockAvailable" into v_actual
  from "Product" where id = p_producto_id
  for update;

  if v_actual is null then
    raise exception 'Producto no encontrado';
  end if;

  v_resultante := v_actual + p_cantidad;

  if v_resultante < 0 then
    raise exception 'Stock insuficiente: hay % y se intentan sacar %', v_actual, abs(p_cantidad);
  end if;

  update "Product"
     set "stockAvailable" = v_resultante,
         "updatedAt" = now()
   where id = p_producto_id;

  insert into "StockMovement" ("productId", type, quantity, "resultingStock", reason)
  values (p_producto_id, p_tipo, abs(p_cantidad), v_resultante, p_motivo);

  return v_resultante;
end;
$$;

-- ---------------------------------------------------------------------
-- Alta de producto
-- ---------------------------------------------------------------------
-- `Product` exige slug, description, longDescription y categoría. AppPack
-- solo pide nombre y precio, así que el resto se completa con valores
-- razonables que después se editan desde la tienda.
create or replace function crear_producto(
  p_nombre        text,
  p_descripcion   text,
  p_sku           text,
  p_codigo_barras text,
  p_categoria_id  text,
  p_unidad_medida text,
  p_precio_costo  int,
  p_precio_venta  int,
  p_stock         int,
  p_stock_minimo  int
) returns text
language plpgsql
as $$
declare
  v_id       text;
  v_categoria text;
begin
  -- Si no se eligió categoría, se usa la primera disponible: la tienda
  -- exige que todo producto tenga una.
  v_categoria := coalesce(p_categoria_id, (select id from "Category" order by name limit 1));
  if v_categoria is null then
    raise exception 'No hay ninguna categoría creada. Creá una antes de cargar productos.';
  end if;

  insert into "Product" (
    id, slug, name, "categoryId", description, "longDescription",
    price, "costPrice", "stockAvailable", "minStock", unit, sku, barcode,
    active, "createdAt", "updatedAt"
  ) values (
    (gen_random_uuid())::text,
    apppack_slug_unico(p_nombre),
    p_nombre,
    v_categoria,
    coalesce(nullif(p_descripcion, ''), p_nombre),
    coalesce(nullif(p_descripcion, ''), p_nombre),
    coalesce(p_precio_venta, 0),
    p_precio_costo,
    coalesce(p_stock, 0),
    coalesce(p_stock_minimo, 0),
    coalesce(nullif(p_unidad_medida, ''), 'unidad'),
    p_sku,
    p_codigo_barras,
    true,
    now(), now()
  ) returning id into v_id;

  if coalesce(p_stock, 0) > 0 then
    insert into "StockMovement" ("productId", type, quantity, "resultingStock", reason)
    values (v_id, 'creacion', p_stock, p_stock, 'Carga inicial');
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Alta de categoría
-- ---------------------------------------------------------------------
-- `Category` también aparece en la navegación de la web, así que necesita
-- slug, icono y descripción.
create or replace function crear_categoria(
  p_nombre      text,
  p_descripcion text default null,
  p_icono       text default 'Package'
) returns text
language plpgsql
as $$
declare
  v_id text;
  v_slug text := apppack_slug(p_nombre);
  n int := 1;
begin
  while exists (select 1 from "Category" where slug = v_slug) loop
    n := n + 1;
    v_slug := apppack_slug(p_nombre) || '-' || n;
  end loop;

  insert into "Category" (id, slug, name, icon, description)
  values ((gen_random_uuid())::text, v_slug, p_nombre,
          coalesce(nullif(p_icono, ''), 'Package'),
          coalesce(nullif(p_descripcion, ''), p_nombre))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Métricas del panel
-- ---------------------------------------------------------------------
create or replace function metricas_stock()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total_productos',  (select count(*) from "Product" where active),
    'valor_costo',      (select coalesce(sum("stockAvailable" * coalesce("costPrice", 0)), 0) from "Product" where active),
    'valor_venta',      (select coalesce(sum("stockAvailable" * price), 0) from "Product" where active),
    'unidades_totales', (select coalesce(sum("stockAvailable"), 0) from "Product" where active),
    'stock_bajo',       (select count(*) from "Product" where active and "stockAvailable" <= "minStock" and "stockAvailable" > 0),
    'sin_stock',        (select count(*) from "Product" where active and "stockAvailable" = 0),
    'inactivos',        (select count(*) from "Product" where not active),
    'productos_criticos', coalesce((
      select jsonb_agg(x) from (
        select id, name as nombre, "stockAvailable" as stock,
               "minStock" as stock_minimo, unit as unidad_medida
          from "Product"
         where active and "stockAvailable" <= "minStock"
         order by "stockAvailable" asc, name asc
         limit 8
      ) x
    ), '[]'::jsonb),
    'stock_por_categoria', coalesce((
      select jsonb_agg(x) from (
        select c.name as categoria,
               null::text as color,
               sum(p."stockAvailable") as unidades
          from "Product" p
          join "Category" c on c.id = p."categoryId"
         where p.active
         group by c.name
        having sum(p."stockAvailable") > 0
         order by sum(p."stockAvailable") desc
         limit 8
      ) x
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- Backfill: los productos que ya existían no tienen historial.
-- Se les crea un movimiento inicial para que el stock cuadre con su
-- último movimiento desde el primer día.
-- ---------------------------------------------------------------------
insert into "StockMovement" ("productId", type, quantity, "resultingStock", reason, "createdAt")
select p.id, 'creacion', p."stockAvailable", p."stockAvailable",
       'Stock inicial al vincular con AppPack', now()
  from "Product" p
 where not exists (select 1 from "StockMovement" m where m."productId" = p.id);
