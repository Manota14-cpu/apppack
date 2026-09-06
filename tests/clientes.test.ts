import { describe, expect, it } from "vitest";
import { clienteSchema, soloDigitos } from "@/lib/validation";

describe("clienteSchema", () => {
  it("acepta un cliente con solo el nombre", () => {
    // En el mostrador, obligar a cargar ocho campos con alguien esperando
    // garantiza que no se cargue ninguno.
    const r = clienteSchema.safeParse({ nombre: "Kiosco El Sol" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.telefono).toBeNull();
    expect(r.data.ciudad).toBeNull();
  });

  it("el nombre es obligatorio", () => {
    expect(clienteSchema.safeParse({ nombre: "   " }).success).toBe(false);
  });

  it("un campo vacío queda nulo, no como cadena vacía", () => {
    const r = clienteSchema.parse({ nombre: "X", telefono: "  ", ciudad: "" });
    expect(r.telefono).toBeNull();
    expect(r.ciudad).toBeNull();
  });

  it("rechaza un correo que no lo es", () => {
    expect(clienteSchema.safeParse({ nombre: "X", email: "sin-arroba" }).success).toBe(false);
    expect(clienteSchema.safeParse({ nombre: "X", email: "a@b" }).success).toBe(false);
  });

  it("acepta un correo válido y deja vacío como nulo", () => {
    expect(clienteSchema.parse({ nombre: "X", email: "juan@correo.com" }).email).toBe(
      "juan@correo.com"
    );
    expect(clienteSchema.parse({ nombre: "X", email: "" }).email).toBeNull();
  });

  it("recorta los espacios del nombre", () => {
    expect(clienteSchema.parse({ nombre: "  Panadería Rivas  " }).nombre).toBe("Panadería Rivas");
  });
});

describe("soloDigitos", () => {
  it("las tres formas de anotar el mismo teléfono coinciden", () => {
    // Sin esto, el aviso de duplicado no saltaría nunca y la agenda se
    // llenaría del mismo cliente tres veces.
    const esperado = "3492301333";
    expect(soloDigitos("3492 30-1333")).toBe(esperado);
    expect(soloDigitos("03492301333")).toBe(esperado);
    expect(soloDigitos("+54 3492 301333")).toBe(esperado);
  });

  it("un teléfono ausente da cadena vacía, no rompe", () => {
    expect(soloDigitos(null)).toBe("");
    expect(soloDigitos("")).toBe("");
  });

  it("un texto sin dígitos da vacío", () => {
    expect(soloDigitos("no tiene")).toBe("");
  });

  it("dos teléfonos distintos no se confunden", () => {
    expect(soloDigitos("3492301333")).not.toBe(soloDigitos("3492301334"));
  });
});
