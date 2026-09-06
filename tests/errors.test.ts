import { describe, expect, it } from "vitest";
import { mensajeDeError } from "@/lib/errors";

/**
 * Las funciones de `db/schema.sql` levantan sus errores con `raise exception`,
 * que en Postgres es el código P0001, y siempre con una frase escrita para
 * quien está mirando la pantalla. Antes se cambiaban por el genérico "no se
 * pudo completar la operación": catorce explicaciones útiles llegaban al
 * usuario como un encogimiento de hombros.
 */
describe("mensajeDeError", () => {
  it("deja pasar el mensaje que la base escribió a propósito", () => {
    expect(mensajeDeError({ code: "P0001", message: "La caja no está abierta." }, "test")).toBe(
      "La caja no está abierta."
    );
  });

  it("deja pasar los mensajes con datos adentro", () => {
    const m = "Lo cobrado (1500) no coincide con el total de la venta (2000).";
    expect(mensajeDeError({ code: "P0001", message: m }, "test")).toBe(m);
  });

  it("un error de Postgres sin mensaje propio se traduce", () => {
    expect(mensajeDeError({ code: "23505" }, "test")).toContain("SKU");
  });

  it("un error desconocido no filtra detalles técnicos", () => {
    const salida = mensajeDeError(
      { code: "XX000", message: 'relation "Product" does not exist at character 15' },
      "test"
    );
    expect(salida).not.toContain("Product");
    expect(salida).toBe("No se pudo completar la operación. Revisá los datos e intentá de nuevo.");
  });

  it("un P0001 sin texto cae en el genérico en vez de dejar el mensaje vacío", () => {
    expect(mensajeDeError({ code: "P0001" }, "test")).toContain("No se pudo completar");
  });

  it("el stock insuficiente conserva el nombre del producto", () => {
    const m = 'Stock insuficiente de "Bolsa camiseta": hay 2 y se intentan sacar 5';
    expect(mensajeDeError({ code: "P0001", message: m }, "test")).toContain("Bolsa camiseta");
  });
});
