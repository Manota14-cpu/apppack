import { describe, expect, it } from "vitest";
import { asuntoDeAviso, htmlDeAviso, textoDeAviso, type Aviso } from "@/lib/avisos-mensaje";

const URL_APP = "https://apppack.vercel.app";

function aviso(parcial: Partial<Aviso> = {}): Aviso {
  return {
    criticos: [],
    agotados: 0,
    pedidos: { cantidad: 0, monto: 0 },
    huella: "x",
    hayAlgo: false,
    ...parcial,
  };
}

const producto = (nombre: string, stock: number, minimo = 20) => ({
  nombre,
  stock,
  stock_minimo: minimo,
  unidad_medida: "x50u",
});

describe("asuntoDeAviso", () => {
  it("resume lo que hay para atender", () => {
    const a = aviso({
      criticos: [producto("Bolsa camiseta", 3)],
      pedidos: { cantidad: 2, monto: 57_400 },
      hayAlgo: true,
    });
    expect(asuntoDeAviso(a)).toBe("AppPack: 1 producto por reponer y 2 pedidos sin atender");
  });

  it("usa singular y plural donde corresponde", () => {
    expect(asuntoDeAviso(aviso({ pedidos: { cantidad: 1, monto: 100 }, hayAlgo: true }))).toContain(
      "1 pedido sin atender"
    );
    expect(
      asuntoDeAviso(aviso({ criticos: [producto("A", 0), producto("B", 1)], hayAlgo: true }))
    ).toContain("2 productos por reponer");
  });

  it("sin nada que atender, lo dice", () => {
    expect(asuntoDeAviso(aviso())).toBe("AppPack: todo en orden");
  });
});

describe("textoDeAviso", () => {
  it("se basta solo: nombra los productos y cuánto queda", () => {
    // Quien lo lee en el celular no debería tener que abrir la app para
    // saber a qué proveedor llamar.
    const t = textoDeAviso(
      aviso({ criticos: [producto("Film PVC 300m", 3, 20)], hayAlgo: true }),
      URL_APP
    );
    expect(t).toContain("Film PVC 300m");
    expect(t).toContain("quedan 3");
    expect(t).toContain("de 20 x50u");
  });

  it("distingue «sin stock» de «queda poco»", () => {
    const t = textoDeAviso(aviso({ criticos: [producto("Agotado", 0)], hayAlgo: true }), URL_APP);
    expect(t).toContain("SIN STOCK");
    expect(t).not.toContain("quedan 0");
  });

  it("pone primero los pedidos, que es lo que tiene plata en juego", () => {
    const t = textoDeAviso(
      aviso({
        criticos: [producto("Bolsa", 2)],
        pedidos: { cantidad: 2, monto: 57_400 },
        hayAlgo: true,
      }),
      URL_APP
    );
    expect(t.indexOf("PEDIDOS")).toBeLessThan(t.indexOf("POR REPONER"));
    expect(t).toContain("$57.400");
  });

  it("con muchos productos resume el resto en vez de mandar una lista infinita", () => {
    const muchos = Array.from({ length: 40 }, (_, i) => producto(`Producto ${i}`, 1));
    const t = textoDeAviso(aviso({ criticos: muchos, hayAlgo: true }), URL_APP);
    expect(t).toContain("y 25 más");
    expect(t).toContain("Producto 0");
    expect(t).not.toContain("Producto 39");
  });

  it("lleva los enlaces a la pantalla ya filtrada", () => {
    const t = textoDeAviso(
      aviso({ criticos: [producto("A", 1)], pedidos: { cantidad: 1, monto: 1 }, hayAlgo: true }),
      URL_APP
    );
    expect(t).toContain(`${URL_APP}/pedidos`);
    expect(t).toContain(`${URL_APP}/productos?stock=bajo`);
  });
});

describe("htmlDeAviso", () => {
  it("escapa el nombre del producto", () => {
    // El nombre lo escribe una persona en un formulario y termina dentro de
    // un correo en HTML: sin escapar, un "<" rompería el mensaje.
    const html = htmlDeAviso(
      aviso({ criticos: [producto('Bolsa <b>"grande"</b> & co', 1)], hayAlgo: true }),
      URL_APP
    );
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<b>grande");
  });

  it("no deja el cuerpo vacío cuando no hay nada", () => {
    const html = htmlDeAviso(aviso(), URL_APP);
    expect(html).toContain("Nada que reponer");
  });

  it("marca en rojo lo agotado y en ámbar lo que queda poco", () => {
    const html = htmlDeAviso(
      aviso({ criticos: [producto("Cero", 0), producto("Poco", 5)], hayAlgo: true }),
      URL_APP
    );
    expect(html).toContain("#a62b22");
    expect(html).toContain("#a65a00");
  });
});
