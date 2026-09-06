"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna, consultarValor, ejecutar } from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { paraBusqueda } from "@/lib/sql";
import {
  clienteSchema,
  formDataAObjeto,
  primerError,
  soloDigitos,
} from "@/lib/validation";
import type { Cliente, CompraCliente } from "@/types/database.types";

function revalidarClientes() {
  revalidatePath("/clientes");
  revalidatePath("/caja");
  revalidatePath("/pedidos");
}

/**
 * La agenda, con lo que cada cliente compró.
 *
 * Los totales salen de los pedidos y no de un contador guardado: un contador
 * que se actualiza a mano se desincroniza en cuanto alguien cancela una venta,
 * y entonces el número deja de servir justo cuando hay que decidir a quién
 * atender mejor.
 */
const CAMPOS_CLIENTE = `
  c.id, c.nombre, c.telefono, c.email, c.ciudad, c.direccion,
  c."dniCuit"     as dni_cuit,
  c."razonSocial" as razon_social,
  c.notas, c.activo,
  c."createdAt"   as created_at,
  (select count(*)::int from "Order" o
    where o."customerId" = c.id and o.status <> 'cancelado'
      and o.channel <> 'devolucion')                          as compras,
  (select coalesce(sum(o.total), 0)::int from "Order" o
    where o."customerId" = c.id and o.status <> 'cancelado')  as gastado,
  (select max(o."createdAt") from "Order" o
    where o."customerId" = c.id and o.status <> 'cancelado')  as ultima_compra
`;

export async function listarClientes(params: {
  q?: string;
  estado?: string;
}): Promise<Cliente[]> {
  await requerirSesion();

  const condiciones: string[] = ["c.activo = $1"];
  const valores: unknown[] = [params.estado !== "archivados"];

  const termino = params.q?.trim();
  if (termino) {
    valores.push(paraBusqueda(termino));
    const i = valores.length;
    condiciones.push(
      `(c.nombre ilike $${i} or c.telefono ilike $${i} or c.email ilike $${i} or c.ciudad ilike $${i})`
    );
  }

  try {
    return await consultar<Cliente>(
      `select ${CAMPOS_CLIENTE}
         from "Customer" c
        where ${condiciones.join(" and ")}
        order by c.nombre
        limit 500`,
      valores
    );
  } catch (error) {
    console.error("[clientes:listar]", error);
    return [];
  }
}

export async function verCliente(clienteId: string): Promise<Cliente | null> {
  await requerirSesion();
  try {
    return await consultarUna<Cliente>(
      `select ${CAMPOS_CLIENTE} from "Customer" c where c.id = $1`,
      [clienteId.slice(0, 64)]
    );
  } catch (error) {
    console.error("[clientes:ver]", error);
    return null;
  }
}

export async function comprasDelCliente(clienteId: string): Promise<CompraCliente[]> {
  await requerirSesion();
  try {
    return await consultar<CompraCliente>(
      `select o.id, o.number as numero, o.channel as canal, o.status as estado,
              o.total, o."createdAt" as created_at,
              (select count(*)::int from "OrderItem" i where i."orderId" = o.id) as renglones
         from "Order" o
        where o."customerId" = $1
        order by o.number desc
        limit 100`,
      [clienteId.slice(0, 64)]
    );
  } catch (error) {
    console.error("[clientes:compras]", error);
    return [];
  }
}

/**
 * Busca un cliente ya cargado cuyo teléfono coincida.
 *
 * Se compara solo por dígitos: «3492 30-1333» y «03492301333» son la misma
 * persona. No bloquea el alta —dos hermanos pueden compartir un teléfono— pero
 * avisa antes de crear el mismo cliente por segunda vez.
 */
async function telefonoRepetido(
  telefono: string | null,
  excluirId?: string
): Promise<string | null> {
  const digitos = soloDigitos(telefono);
  if (digitos.length < 6) return null;

  const fila = await consultarUna<{ nombre: string }>(
    `select nombre from "Customer"
      where activo
        and length(regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g')) >= 6
        and regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g') like '%' || $1
        and ($2::text is null or id <> $2)
      limit 1`,
    [digitos, excluirId ?? null]
  );
  return fila?.nombre ?? null;
}

export async function crearCliente(formData: FormData) {
  await requerirSesion();

  const parsed = clienteSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    const repetido = await telefonoRepetido(d.telefono);
    if (repetido) {
      return falloDeValidacion(
        `Ya hay un cliente con ese teléfono: «${repetido}». Buscalo en la lista o cambiá el número.`
      );
    }

    const id = await consultarValor<string>(
      `insert into "Customer" (id, nombre, telefono, email, ciudad, direccion,
                               "dniCuit", "razonSocial", notas, "updatedAt")
       values ((gen_random_uuid())::text, $1, $2, $3, $4, $5, $6, $7, $8, now())
       returning id`,
      [d.nombre, d.telefono, d.email, d.ciudad, d.direccion, d.dni_cuit, d.razon_social, d.notas]
    );

    revalidarClientes();
    return { success: true as const, id };
  } catch (error) {
    return fallo(error, "clientes:crear");
  }
}

export async function actualizarCliente(clienteId: string, formData: FormData) {
  await requerirSesion();

  const parsed = clienteSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;
  const id = clienteId.slice(0, 64);

  try {
    const repetido = await telefonoRepetido(d.telefono, id);
    if (repetido) {
      return falloDeValidacion(`Ese teléfono ya es de «${repetido}».`);
    }

    await ejecutar(
      `update "Customer" set
         nombre = $2, telefono = $3, email = $4, ciudad = $5, direccion = $6,
         "dniCuit" = $7, "razonSocial" = $8, notas = $9, "updatedAt" = now()
       where id = $1`,
      [id, d.nombre, d.telefono, d.email, d.ciudad, d.direccion, d.dni_cuit, d.razon_social, d.notas]
    );
  } catch (error) {
    return fallo(error, "clientes:actualizar");
  }

  revalidarClientes();
  return { success: true as const };
}

/**
 * Archiva o recupera un cliente.
 *
 * No se borra: sus ventas quedarían sin dueño y el historial dejaría de cerrar.
 * Archivado desaparece de las búsquedas y del selector de la caja, que es lo
 * que se quiere cuando alguien deja de comprar.
 */
export async function archivarCliente(clienteId: string, activo: boolean) {
  await requerirSesion();

  try {
    await ejecutar(`update "Customer" set activo = $2, "updatedAt" = now() where id = $1`, [
      clienteId.slice(0, 64),
      activo,
    ]);
  } catch (error) {
    return fallo(error, "clientes:archivar");
  }

  revalidarClientes();
  return { success: true as const };
}

export interface ClienteBreve {
  id: string;
  nombre: string;
  telefono: string | null;
  ciudad: string | null;
}

/** Para el selector de la caja: pocos resultados y solo lo que se ve en la lista. */
export async function buscarClientes(query: string): Promise<ClienteBreve[]> {
  await requerirSesion();
  const termino = query.trim();
  if (termino.length < 2) return [];

  try {
    return await consultar<ClienteBreve>(
      `select id, nombre, telefono, ciudad
         from "Customer"
        where activo and (nombre ilike $1 or telefono ilike $1 or email ilike $1)
        order by nombre
        limit 8`,
      [paraBusqueda(termino)]
    );
  } catch (error) {
    console.error("[clientes:buscar]", error);
    return [];
  }
}

/**
 * Crea un cliente desde la caja, con lo mínimo.
 *
 * En el mostrador no se van a cargar ocho campos con alguien esperando: se
 * guarda el nombre y el teléfono, y el resto se completa después desde la
 * ficha si hace falta.
 */
export async function crearClienteRapido(nombre: string, telefono: string) {
  await requerirSesion();

  const limpio = nombre.trim().slice(0, 160);
  if (!limpio) return falloDeValidacion("Escribí un nombre.");

  const tel = telefono.trim().slice(0, 40) || null;

  try {
    const repetido = await telefonoRepetido(tel);
    if (repetido) {
      return falloDeValidacion(`Ya hay un cliente con ese teléfono: «${repetido}».`);
    }

    const id = await consultarValor<string>(
      `insert into "Customer" (id, nombre, telefono, "updatedAt")
       values ((gen_random_uuid())::text, $1, $2, now())
       returning id`,
      [limpio, tel]
    );

    revalidarClientes();
    return { success: true as const, id, nombre: limpio };
  } catch (error) {
    return fallo(error, "clientes:crearRapido");
  }
}
