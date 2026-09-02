import { beforeEach, describe, expect, it } from "vitest";
import { crearTokenSesion, passwordMatches, tokenEsValido } from "@/lib/admin-auth";

describe("contraseña de administrador", () => {
  it("acepta la contraseña correcta", () => {
    expect(passwordMatches("secreta-123", "secreta-123")).toBe(true);
  });

  it("rechaza la incorrecta, incluso si difiere en un carácter", () => {
    expect(passwordMatches("secreta-124", "secreta-123")).toBe(false);
  });

  it("rechaza si el servidor no tiene contraseña configurada", () => {
    expect(passwordMatches("lo-que-sea", "")).toBe(false);
  });

  it("compara sin filtrar la longitud de la contraseña", () => {
    // Las de distinto largo no deben romper: se hashean antes de comparar.
    expect(passwordMatches("a", "una-contraseña-mucho-mas-larga")).toBe(false);
  });
});

describe("tokens de sesión", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "contraseña-de-prueba";
    delete process.env.SESSION_SECRET;
  });

  it("emite un token válido", () => {
    const token = crearTokenSesion();
    expect(token).toBeTruthy();
    expect(tokenEsValido(token!)).toBe(true);
  });

  it("emite un token distinto en cada login", () => {
    // Antes la cookie era sha256(contraseña): siempre el mismo valor.
    expect(crearTokenSesion()).not.toBe(crearTokenSesion());
  });

  it("el token no contiene la contraseña", () => {
    const token = crearTokenSesion()!;
    expect(token).not.toContain("contraseña-de-prueba");
    const cuerpo = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
    expect(cuerpo).not.toContain("contraseña-de-prueba");
  });

  it("rechaza un token con la firma alterada", () => {
    const token = crearTokenSesion()!;
    const [cuerpo] = token.split(".");
    expect(tokenEsValido(`${cuerpo}.firmafalsa`)).toBe(false);
  });

  it("rechaza un token con el contenido alterado", () => {
    const token = crearTokenSesion()!;
    const [, firma] = token.split(".");
    const falso = Buffer.from(JSON.stringify({ jti: "x", exp: Date.now() + 999999 })).toString("base64url");
    expect(tokenEsValido(`${falso}.${firma}`)).toBe(false);
  });

  it("rechaza un token vencido", () => {
    const cuerpo = Buffer.from(JSON.stringify({ jti: "x", exp: Date.now() - 1000 })).toString("base64url");
    expect(tokenEsValido(`${cuerpo}.cualquiera`)).toBe(false);
  });

  it("rechaza basura y valores vacíos", () => {
    expect(tokenEsValido(undefined)).toBe(false);
    expect(tokenEsValido("")).toBe(false);
    expect(tokenEsValido("sin-punto")).toBe(false);
    expect(tokenEsValido("a.b.c")).toBe(false);
  });

  it("cambiar la contraseña invalida las sesiones existentes", () => {
    const token = crearTokenSesion()!;
    expect(tokenEsValido(token)).toBe(true);

    process.env.ADMIN_PASSWORD = "contraseña-nueva";
    expect(tokenEsValido(token)).toBe(false);
  });

  it("cambiar SESSION_SECRET también las invalida", () => {
    const token = crearTokenSesion()!;
    process.env.SESSION_SECRET = "rotacion-1";
    expect(tokenEsValido(token)).toBe(false);
  });
});
