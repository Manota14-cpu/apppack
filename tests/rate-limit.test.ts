import { beforeEach, describe, expect, it } from "vitest";
import { limpiarIntentos, registrarFallo, verificarLimite } from "@/lib/rate-limit";

describe("limitador de intentos de login", () => {
  beforeEach(() => {
    limpiarIntentos("ip-test");
  });

  it("permite intentar cuando no hay historial", () => {
    const r = verificarLimite("ip-test");
    expect(r.permitido).toBe(true);
    expect(r.intentosRestantes).toBe(5);
  });

  it("descuenta intentos con cada fallo", () => {
    registrarFallo("ip-test");
    expect(verificarLimite("ip-test").intentosRestantes).toBe(4);
    registrarFallo("ip-test");
    expect(verificarLimite("ip-test").intentosRestantes).toBe(3);
  });

  it("bloquea al llegar al quinto fallo", () => {
    for (let i = 0; i < 4; i++) {
      expect(registrarFallo("ip-test").permitido).toBe(true);
    }
    const quinto = registrarFallo("ip-test");
    expect(quinto.permitido).toBe(false);
    expect(quinto.segundosRestantes).toBeGreaterThan(0);
  });

  it("mientras está bloqueado no deja intentar", () => {
    for (let i = 0; i < 5; i++) registrarFallo("ip-test");
    const r = verificarLimite("ip-test");
    expect(r.permitido).toBe(false);
    expect(r.intentosRestantes).toBe(0);
  });

  it("un login exitoso limpia el historial", () => {
    for (let i = 0; i < 5; i++) registrarFallo("ip-test");
    expect(verificarLimite("ip-test").permitido).toBe(false);

    limpiarIntentos("ip-test");
    expect(verificarLimite("ip-test").permitido).toBe(true);
  });

  it("el bloqueo se escala con la reincidencia", () => {
    for (let i = 0; i < 5; i++) registrarFallo("ip-test");
    const primero = verificarLimite("ip-test").segundosRestantes;

    for (let i = 0; i < 5; i++) registrarFallo("ip-test");
    const segundo = verificarLimite("ip-test").segundosRestantes;

    expect(segundo).toBeGreaterThan(primero);
  });

  it("aísla el conteo por identidad", () => {
    for (let i = 0; i < 5; i++) registrarFallo("ip-test");
    expect(verificarLimite("ip-test").permitido).toBe(false);
    expect(verificarLimite("otra-ip").permitido).toBe(true);
    limpiarIntentos("otra-ip");
  });
});
