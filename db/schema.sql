-- =====================================================================
-- APPPACK — Funciones de stock sobre el catálogo de la tienda
-- =====================================================================
-- AppPack administra la MISMA tabla `Product` que muestra la web. No hay
-- catálogo duplicado ni sincronización: lo que se cambia acá es lo que ve
-- el cliente (la web cachea las páginas 60 segundos).
--
-- Las tablas (`Product`, `Category`, `StockMovement`, `Order`, `PriceChange`,
-- `CashSession`…) las gobierna Prisma desde
-- packdistribuidora/prisma/schema.prisma. Este archivo solo agrega las
-- funciones y disparadores que Prisma no maneja.
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
--
-- El parámetro `p_excluir` se agregó después, para que editar un producto no
-- lo cuente a él mismo al buscar choques. Agregar un parámetro NO reemplaza la
-- versión anterior: `create or replace` la habría dejado conviviendo con esta,
-- y `apppack_slug_unico(nombre)` pasaría a ser ambigua — con lo que fallaría
-- toda alta de producto. Por eso se descarta explícitamente la firma vieja.
drop function if exists apppack_slug_unico(text);

create or replace function apppack_slug_unico(txt text, p_excluir text default null)
returns text
language plpgsql
as $$
declare
  base    text := coalesce(nullif(apppack_slug(txt), ''), 'producto');
  intento text := base;
  n int := 1;
begin
  while exists (
    select 1 from "Product"
     where slug = intento
       and (p_excluir is null or id <> p_excluir)
  ) loop
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
  v_nombre     text;
  v_resultante int;
begin
  select "stockAvailable", name into v_actual, v_nombre
  from "Product" where id = p_producto_id
  for update;

  if v_actual is null then
    raise exception 'Producto no encontrado';
  end if;

  v_resultante := v_actual + p_cantidad;

  if v_resultante < 0 then
    -- Nombrar el producto importa: en un pedido de ocho renglones, "stock
    -- insuficiente" a secas no dice cuál hay que corregir.
    raise exception 'Stock insuficiente de "%": hay % y se intentan sacar %',
      v_nombre, v_actual, abs(p_cantidad)
      using errcode = 'P0001';
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
-- Historial de precios, por disparador
-- ---------------------------------------------------------------------
-- El stock nunca cambia sin dejar movimiento porque siempre pasa por
-- ajustar_stock(). Con el precio no había forma equivalente, así que se
-- hace del otro lado: cualquier UPDATE que toque `price` o `costPrice`
-- —de AppPack, de un ajuste masivo o de una consulta a mano— queda
-- registrado. El motivo se pasa por transacción con
--   set local apppack.motivo = '...'
create or replace function apppack_registrar_cambio_precio()
returns trigger
language plpgsql
as $$
begin
  if new.price is distinct from old.price
     or new."costPrice" is distinct from old."costPrice" then
    insert into "PriceChange" (
      "productId", "oldPrice", "newPrice", "oldCostPrice", "newCostPrice", reason
    ) values (
      old.id, old.price, new.price, old."costPrice", new."costPrice",
      nullif(current_setting('apppack.motivo', true), '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists apppack_precio_historial on "Product";
create trigger apppack_precio_historial
  after update on "Product"
  for each row
  execute function apppack_registrar_cambio_precio();

-- ---------------------------------------------------------------------
-- Alta y edición de producto
-- ---------------------------------------------------------------------
-- Reciben un jsonb en vez de veintipico de parámetros posicionales: la
-- lista de campos editables creció y una firma posicional de ese largo es
-- imposible de leer y fácil de desordenar sin que nada avise.
--
-- La firma vieja de 10 parámetros se descarta explícitamente: `create or
-- replace` no la reemplaza, la dejaría conviviendo con la nueva.
drop function if exists crear_producto(text, text, text, text, text, text, int, int, int, int);

create or replace function crear_producto(p jsonb)
returns text
language plpgsql
as $$
declare
  v_id        text;
  v_categoria text;
  v_nombre    text := p->>'nombre';
begin
  -- Si no se eligió categoría, se usa la primera disponible: la tienda
  -- exige que todo producto tenga una.
  v_categoria := coalesce(
    nullif(p->>'categoria_id', ''),
    (select id from "Category" order by name limit 1)
  );
  if v_categoria is null then
    raise exception 'No hay ninguna categoría creada. Creá una antes de cargar productos.';
  end if;

  insert into "Product" (
    id, slug, name, "categoryId", description, "longDescription", features,
    price, "oldPrice", discount, "costPrice",
    "stockAvailable", "minStock", unit, sku, barcode,
    "weightGrams", dimensions, featured, "bestSeller", "isNew", rating,
    "minWholesaleQty", "wholesalePrice", "metaTitle", "metaDescription",
    icon, active, "createdAt", "updatedAt"
  ) values (
    (gen_random_uuid())::text,
    apppack_slug_unico(v_nombre),
    v_nombre,
    v_categoria,
    coalesce(nullif(p->>'descripcion', ''), v_nombre),
    coalesce(nullif(p->>'descripcion_larga', ''), nullif(p->>'descripcion', ''), v_nombre),
    coalesce(p->>'caracteristicas', '[]'),
    coalesce((p->>'precio_venta')::int, 0),
    (p->>'precio_anterior')::int,
    (p->>'descuento')::int,
    -- Un costo en cero es "todavía no lo sé", no "vale cero": se guarda
    -- nulo para no inventar un dato que nadie cargó.
    nullif((p->>'precio_costo')::int, 0),
    coalesce((p->>'stock')::int, 0),
    coalesce((p->>'stock_minimo')::int, 0),
    coalesce(nullif(p->>'unidad_medida', ''), 'unidad'),
    nullif(p->>'sku', ''),
    nullif(p->>'codigo_barras', ''),
    (p->>'peso_gramos')::int,
    nullif(p->>'dimensiones', ''),
    coalesce((p->>'destacado')::boolean, false),
    coalesce((p->>'mas_vendido')::boolean, false),
    coalesce((p->>'es_nuevo')::boolean, false),
    coalesce((p->>'puntuacion')::float, 0),
    (p->>'cantidad_mayorista_min')::int,
    (p->>'precio_mayorista')::int,
    nullif(p->>'meta_titulo', ''),
    nullif(p->>'meta_descripcion', ''),
    coalesce(nullif(p->>'icono', ''), 'Package'),
    true,
    now(), now()
  ) returning id into v_id;

  if coalesce((p->>'stock')::int, 0) > 0 then
    insert into "StockMovement" ("productId", type, quantity, "resultingStock", reason)
    values (v_id, 'creacion', (p->>'stock')::int, (p->>'stock')::int, 'Carga inicial');
  end if;

  return v_id;
end;
$$;

-- El stock no se toca acá: solo cambia por movimientos trazables.
create or replace function actualizar_producto(p_id text, p jsonb)
returns void
language plpgsql
as $$
declare
  v_nombre_actual text;
begin
  select name into v_nombre_actual from "Product" where id = p_id for update;
  if v_nombre_actual is null then
    raise exception 'Producto no encontrado';
  end if;

  update "Product" set
    name              = p->>'nombre',
    -- El slug es la URL del producto en la tienda. Se rehace solo si cambió
    -- el nombre: cambiarlo porque sí rompería los enlaces que ya circulan.
    slug              = case when p->>'nombre' is distinct from v_nombre_actual
                             then apppack_slug_unico(p->>'nombre', p_id)
                             else slug end,
    description       = coalesce(nullif(p->>'descripcion', ''), p->>'nombre'),
    "longDescription" = coalesce(nullif(p->>'descripcion_larga', ''),
                                 nullif(p->>'descripcion', ''), p->>'nombre'),
    features          = coalesce(p->>'caracteristicas', '[]'),
    sku               = nullif(p->>'sku', ''),
    barcode           = nullif(p->>'codigo_barras', ''),
    "categoryId"      = coalesce(nullif(p->>'categoria_id', ''), "categoryId"),
    unit              = coalesce(nullif(p->>'unidad_medida', ''), 'unidad'),
    "costPrice"       = nullif((p->>'precio_costo')::int, 0),
    price             = coalesce((p->>'precio_venta')::int, price),
    "oldPrice"        = (p->>'precio_anterior')::int,
    discount          = (p->>'descuento')::int,
    "minStock"        = coalesce((p->>'stock_minimo')::int, 0),
    "weightGrams"     = (p->>'peso_gramos')::int,
    dimensions        = nullif(p->>'dimensiones', ''),
    featured          = coalesce((p->>'destacado')::boolean, false),
    "bestSeller"      = coalesce((p->>'mas_vendido')::boolean, false),
    "isNew"           = coalesce((p->>'es_nuevo')::boolean, false),
    rating            = coalesce((p->>'puntuacion')::float, 0),
    "minWholesaleQty" = (p->>'cantidad_mayorista_min')::int,
    "wholesalePrice"  = (p->>'precio_mayorista')::int,
    "metaTitle"       = nullif(p->>'meta_titulo', ''),
    "metaDescription" = nullif(p->>'meta_descripcion', ''),
    icon              = coalesce(nullif(p->>'icono', ''), 'Package'),
    "updatedAt"       = now()
  where id = p_id;
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
-- Pedidos
-- ---------------------------------------------------------------------
-- Cambiar el estado de un pedido puede mover stock: cancelar uno devuelve
-- a la estantería lo que se había descontado, y reabrirlo lo vuelve a
-- sacar. Va en una función para que el stock y el estado no puedan quedar
-- desfasados si algo falla a mitad de camino.
create or replace function cambiar_estado_pedido(p_pedido_id text, p_estado text)
returns void
language plpgsql
as $$
declare
  v_actual text;
  v_numero int;
  r record;
begin
  select status, number into v_actual, v_numero
  from "Order" where id = p_pedido_id
  for update;

  if v_actual is null then
    raise exception 'Pedido no encontrado';
  end if;
  if v_actual = p_estado then
    return;
  end if;

  -- Se cancela: vuelve el stock.
  if p_estado = 'cancelado' then
    for r in
      select i."productId" as pid, sum(i.quantity)::int as cant
        from "OrderItem" i
       where i."orderId" = p_pedido_id and i."productId" is not null
       group by i."productId"
    loop
      -- Si el producto se borró del catálogo, el pedido igual se cancela.
      if exists (select 1 from "Product" where id = r.pid) then
        perform ajustar_stock(r.pid, r.cant, 'Pedido #' || v_numero || ' cancelado', 'ajuste');
      end if;
    end loop;

  -- Se reabre un pedido cancelado: se vuelve a descontar.
  elsif v_actual = 'cancelado' then
    for r in
      select i."productId" as pid, sum(i.quantity)::int as cant
        from "OrderItem" i
       where i."orderId" = p_pedido_id and i."productId" is not null
       group by i."productId"
    loop
      if exists (select 1 from "Product" where id = r.pid) then
        perform ajustar_stock(r.pid, -r.cant, 'Pedido #' || v_numero || ' reabierto', 'venta');
      end if;
    end loop;
  end if;

  update "Order" set status = p_estado where id = p_pedido_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Caja de mostrador
-- ---------------------------------------------------------------------
-- La función de recuentos se retiró; sus tablas y funciones se descartan
-- explícitamente para que una base vieja quede igual que una nueva.
drop function if exists abrir_recuento(text, text);
drop function if exists cerrar_recuento(text);
drop table if exists "StockCountItem";
drop table if exists "StockCount";

-- Abre un turno. Uno solo a la vez: dos cajas abiertas en paralelo harían
-- imposible saber a cuál pertenece cada cobro.
create or replace function abrir_caja(p_fondo int, p_nota text default null)
returns text
language plpgsql
as $$
declare
  v_id text;
  v_numero int;
begin
  if exists (select 1 from "CashSession" where status = 'abierta') then
    raise exception 'Ya hay una caja abierta. Cerrala antes de abrir otra.'
      using errcode = 'P0001';
  end if;

  select coalesce(max(number), 0) + 1 into v_numero from "CashSession";

  insert into "CashSession" (number, status, "openingFloat", note)
  values (v_numero, 'abierta', greatest(coalesce(p_fondo, 0), 0), nullif(p_nota, ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- Cobra una venta de mostrador.
--
-- Hace lo mismo que un pedido de la tienda —crear la venta y descontar el
-- stock— pero en una sola operación: si un renglón no tiene stock, no queda
-- media venta cobrada. Antes esto se cargaba como "salida" a mano, sin precio
-- ni cliente, así que la plata no figuraba en ningún informe.
-- `p.pagos` es una lista de {metodo, monto}. Una venta puede pagarse con más
-- de un medio —"mitad efectivo, mitad transferencia" es lo habitual en el
-- mostrador— y con una sola columna había que elegir cuál mentir.
create or replace function cobrar_mostrador(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_caja    text := p->>'caja_id';
  v_id      text;
  v_numero  int;
  v_total   bigint := 0;
  v_pagado  bigint := 0;
  v_medios  int;
  v_etiqueta text;
  r         jsonb;
begin
  if not exists (select 1 from "CashSession" where id = v_caja and status = 'abierta') then
    raise exception 'La caja no está abierta.' using errcode = 'P0001';
  end if;

  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'No hay nada para cobrar.' using errcode = 'P0001';
  end if;

  for r in select * from jsonb_array_elements(p->'items') loop
    v_total := v_total + ((r->>'precio')::bigint * (r->>'cantidad')::bigint);
  end loop;

  select coalesce(sum((x->>'monto')::bigint), 0), count(*)
    into v_pagado, v_medios
    from jsonb_array_elements(coalesce(p->'pagos', '[]'::jsonb)) x;

  if v_medios = 0 then
    raise exception 'Falta indicar cómo se pagó.' using errcode = 'P0001';
  end if;
  -- Lo cobrado tiene que ser exactamente el total: si no, el arqueo de cierre
  -- arrastraría una diferencia que nadie va a poder explicar mañana.
  if v_pagado <> v_total then
    raise exception 'Lo cobrado (%) no coincide con el total de la venta (%).', v_pagado, v_total
      using errcode = 'P0001';
  end if;

  select case when count(distinct x->>'metodo') = 1
              then min(x->>'metodo') else 'mixto' end
    into v_etiqueta
    from jsonb_array_elements(p->'pagos') x;

  select coalesce(max(number), 0) + 1 into v_numero from "Order";

  insert into "Order" (
    id, number, channel, status, nombre, total, "paymentMethod", "cashReceived",
    "sessionId", notas, "createdAt"
  ) values (
    (gen_random_uuid())::text, v_numero, 'mostrador', 'entregado',
    coalesce(nullif(p->>'nombre', ''), 'Mostrador'),
    v_total,
    v_etiqueta,
    nullif((p->>'recibido')::int, 0),
    v_caja,
    nullif(p->>'notas', ''),
    now()
  ) returning id into v_id;

  for r in select * from jsonb_array_elements(p->'pagos') loop
    insert into "OrderPayment" ("orderId", method, amount)
    values (v_id, r->>'metodo', (r->>'monto')::int);
  end loop;

  for r in select * from jsonb_array_elements(p->'items') loop
    insert into "OrderItem" (id, "orderId", "productId", name, unit, price, quantity)
    values (
      (gen_random_uuid())::text, v_id,
      nullif(r->>'producto_id', ''),
      r->>'nombre',
      coalesce(nullif(r->>'unidad_medida', ''), 'unidad'),
      (r->>'precio')::int,
      (r->>'cantidad')::int
    );

    -- Mismo camino que la tienda: bloquea la fila, valida y deja movimiento.
    if nullif(r->>'producto_id', '') is not null then
      perform ajustar_stock(
        r->>'producto_id',
        -((r->>'cantidad')::int),
        'Venta mostrador #' || v_numero,
        'venta'
      );
    end if;
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- Devoluciones
-- ---------------------------------------------------------------------
-- Una devolución es una venta al revés, y se guarda como tal: cantidades e
-- importes negativos sobre la misma tabla. Así toda suma que ya existía
-- —informes, arqueo, totales del Excel— le da el signo correcto sin que
-- ninguna consulta tenga que acordarse de un caso especial.
create or replace function devolver_mostrador(p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_caja   text := p->>'caja_id';
  v_id     text;
  v_numero int;
  v_total  bigint := 0;
  v_origen int;
  r        jsonb;
begin
  if not exists (select 1 from "CashSession" where id = v_caja and status = 'abierta') then
    raise exception 'La caja no está abierta.' using errcode = 'P0001';
  end if;

  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'No hay nada para devolver.' using errcode = 'P0001';
  end if;

  for r in select * from jsonb_array_elements(p->'items') loop
    if (r->>'cantidad')::int <= 0 then
      raise exception 'La cantidad a devolver tiene que ser mayor a cero.' using errcode = 'P0001';
    end if;
    v_total := v_total + ((r->>'precio')::bigint * (r->>'cantidad')::bigint);
  end loop;

  select number into v_origen from "Order" where id = nullif(p->>'pedido_id', '');
  select coalesce(max(number), 0) + 1 into v_numero from "Order";

  insert into "Order" (
    id, number, channel, status, nombre, total, "paymentMethod",
    "sessionId", notas, "createdAt"
  ) values (
    (gen_random_uuid())::text, v_numero, 'devolucion', 'entregado',
    coalesce(nullif(p->>'nombre', ''), 'Devolución'),
    -v_total,
    coalesce(nullif(p->>'metodo_pago', ''), 'efectivo'),
    v_caja,
    nullif(
      trim(coalesce(p->>'notas', '') ||
           case when v_origen is not null then ' (de la venta #' || v_origen || ')' else '' end),
      ''),
    now()
  ) returning id into v_id;

  insert into "OrderPayment" ("orderId", method, amount)
  values (v_id, coalesce(nullif(p->>'metodo_pago', ''), 'efectivo'), -v_total);

  for r in select * from jsonb_array_elements(p->'items') loop
    insert into "OrderItem" (id, "orderId", "productId", name, unit, price, quantity)
    values (
      (gen_random_uuid())::text, v_id,
      nullif(r->>'producto_id', ''),
      r->>'nombre',
      coalesce(nullif(r->>'unidad_medida', ''), 'unidad'),
      (r->>'precio')::int,
      -((r->>'cantidad')::int)
    );

    -- La mercadería vuelve a la estantería, con su movimiento.
    if nullif(r->>'producto_id', '') is not null then
      perform ajustar_stock(
        r->>'producto_id',
        (r->>'cantidad')::int,
        'Devolución #' || v_numero,
        'devolucion'
      );
    end if;
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total);
end;
$$;

-- Registra plata que entra o sale sin ser una venta.
create or replace function mover_caja(
  p_caja_id text,
  p_tipo    text,
  p_monto   int,
  p_motivo  text
) returns text
language plpgsql
as $$
declare
  v_id text;
begin
  if p_tipo not in ('retiro', 'ingreso') then
    raise exception 'Tipo de movimiento inválido.' using errcode = 'P0001';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from "CashSession" where id = p_caja_id and status = 'abierta') then
    raise exception 'La caja no está abierta.' using errcode = 'P0001';
  end if;

  insert into "CashMovement" ("sessionId", type, amount, reason)
  values (p_caja_id, p_tipo, p_monto, p_motivo)
  returning id into v_id;

  return v_id;
end;
$$;

-- Cierra el turno y devuelve el arqueo.
create or replace function cerrar_caja(p_caja_id text, p_contado int, p_nota text default null)
returns jsonb
language plpgsql
as $$
declare
  v_estado   text;
  v_fondo    int;
  v_efectivo bigint;
  v_total    bigint;
  v_retiros  bigint;
  v_ingresos bigint;
  v_esperado bigint;
begin
  select status, "openingFloat" into v_estado, v_fondo
  from "CashSession" where id = p_caja_id
  for update;

  if v_estado is null then
    raise exception 'La caja no existe.';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada.' using errcode = 'P0001';
  end if;

  -- El efectivo sale de los pagos, no de `Order.paymentMethod`: en una venta
  -- pagada mitad y mitad, esa columna dice "mixto" y el cajón solo recibió la
  -- parte en efectivo. Las devoluciones vienen con importe negativo, así que
  -- restan solas.
  select coalesce((
           select sum(pg.amount) from "OrderPayment" pg
             join "Order" o2 on o2.id = pg."orderId"
            where o2."sessionId" = p_caja_id and o2.status <> 'cancelado'
              and pg.method = 'efectivo'), 0),
         coalesce(sum(total), 0)
    into v_efectivo, v_total
    from "Order"
   where "sessionId" = p_caja_id and status <> 'cancelado';

  select coalesce(sum(amount) filter (where type = 'retiro'), 0),
         coalesce(sum(amount) filter (where type = 'ingreso'), 0)
    into v_retiros, v_ingresos
    from "CashMovement"
   where "sessionId" = p_caja_id;

  -- Lo que debería haber en el cajón: el fondo, más lo cobrado en efectivo,
  -- más lo que se agregó, menos lo que se sacó.
  v_esperado := v_fondo + v_efectivo + v_ingresos - v_retiros;

  update "CashSession"
     set status = 'cerrada',
         "countedCash" = greatest(coalesce(p_contado, 0), 0),
         note = coalesce(nullif(p_nota, ''), note),
         "closedAt" = now()
   where id = p_caja_id;

  return jsonb_build_object(
    'fondo', v_fondo,
    'efectivo', v_efectivo,
    'total', v_total,
    'retiros', v_retiros,
    'ingresos', v_ingresos,
    'esperado', v_esperado,
    'contado', greatest(coalesce(p_contado, 0), 0),
    'diferencia', greatest(coalesce(p_contado, 0), 0) - v_esperado
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Edición de un pedido
-- ---------------------------------------------------------------------
-- Reemplaza los renglones y reconcilia el stock por diferencia: lo que se
-- agregó sale del depósito, lo que se quitó vuelve. Se hace comparando el
-- antes contra el después en vez de aplicar cambios de a uno, porque cambiar
-- una cantidad y mover un producto a otro renglón son la misma operación
-- vistas de cerca, y tratarlas por separado deja huecos.
--
-- Un pedido cancelado no se edita: su stock ya volvió, y tocar los renglones
-- lo descontaría de nuevo.
create or replace function editar_pedido(p_id text, p jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_numero int;
  v_estado text;
  v_total  bigint := 0;
  r        record;
  it       jsonb;
begin
  select number, status into v_numero, v_estado
  from "Order" where id = p_id
  for update;

  if v_numero is null then
    raise exception 'El pedido no existe.';
  end if;
  if v_estado = 'cancelado' then
    raise exception 'Un pedido cancelado no se puede editar. Reabrilo primero.'
      using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'El pedido tiene que tener al menos un renglón.' using errcode = 'P0001';
  end if;

  create temporary table if not exists _nuevos (
    producto_id text, nombre text, unidad text, precio int, cantidad int
  ) on commit drop;
  delete from _nuevos;

  for it in select * from jsonb_array_elements(p->'items') loop
    insert into _nuevos values (
      nullif(it->>'producto_id', ''),
      it->>'nombre',
      coalesce(nullif(it->>'unidad_medida', ''), 'unidad'),
      (it->>'precio')::int,
      (it->>'cantidad')::int
    );
    v_total := v_total + ((it->>'precio')::bigint * (it->>'cantidad')::bigint);
  end loop;

  -- Diferencia por producto entre lo que había y lo que queda.
  for r in
    select coalesce(a.pid, n.producto_id) as pid,
           coalesce(n.cant, 0) - coalesce(a.cant, 0) as delta
      from (select "productId" as pid, sum(quantity)::int as cant
              from "OrderItem" where "orderId" = p_id and "productId" is not null
             group by "productId") a
      full outer join (select producto_id, sum(cantidad)::int as cant
              from _nuevos where producto_id is not null
             group by producto_id) n on n.producto_id = a.pid
  loop
    if r.pid is not null and r.delta <> 0 then
      -- Más cantidad en el pedido significa menos en la estantería.
      perform ajustar_stock(r.pid, -r.delta, 'Edición del pedido #' || v_numero,
                            case when r.delta > 0 then 'venta' else 'devolucion' end);
    end if;
  end loop;

  delete from "OrderItem" where "orderId" = p_id;
  insert into "OrderItem" (id, "orderId", "productId", name, unit, price, quantity)
  select (gen_random_uuid())::text, p_id, producto_id, nombre, unidad, precio, cantidad
    from _nuevos;

  update "Order"
     set total = v_total,
         nombre = coalesce(nullif(p->>'nombre', ''), nombre),
         notas = nullif(p->>'notas', '')
   where id = p_id;

  return jsonb_build_object('numero', v_numero, 'total', v_total);
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
    -- Datos que faltan y que hacen mentir a otros números: sin costo, el
    -- valor de inventario no significa nada; sin SKU, la importación no
    -- puede actualizar y duplica el catálogo.
    'sin_costo',        (select count(*) from "Product" where active and coalesce("costPrice", 0) = 0),
    -- Un costo que deja más del 85% de margen no es un costo: es un relleno
    -- para sacarse de encima el aviso de "falta cargar". Y miente peor que la
    -- ausencia — un número vacío se nota, uno inventado se cree.
    'costo_dudoso',     (select count(*) from "Product"
                          where active and price > 0 and coalesce("costPrice", 0) > 0
                            and "costPrice" < price * 0.15),
    'sin_sku',          (select count(*) from "Product" where active and coalesce(sku, '') = ''),
    'sin_imagen',       (select count(*) from "Product" p where p.active
                          and not exists (select 1 from "ProductImage" i where i."productId" = p.id)),
    'pedidos_pendientes', (select count(*) from "Order" where status in ('pendiente', 'preparando')),
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

-- ---------------------------------------------------------------------
-- Backfill: las ventas anteriores al desglose de pagos.
-- ---------------------------------------------------------------------
-- Antes, el medio de pago era una sola columna. Ahora los totales por medio
-- —y el efectivo del arqueo— salen de "OrderPayment", así que una venta vieja
-- sin su fila de pago desaparecería del desglose y su efectivo contaría cero.
-- Se les crea el pago que les corresponde, con el importe entero.
insert into "OrderPayment" ("orderId", method, amount)
select o.id, coalesce(o."paymentMethod", 'efectivo'), o.total
  from "Order" o
 where o."paymentMethod" is not null
   and o."paymentMethod" <> 'mixto'
   and not exists (select 1 from "OrderPayment" p where p."orderId" = o.id);
