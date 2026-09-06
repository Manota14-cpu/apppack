"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/formato";
import { normalizarNumero, parsearNumero, tieneSeparadores } from "@/lib/monto";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value" | "defaultValue"> {
  /** Si se pasa, viaja en el FormData ya normalizado, sin separadores. */
  name?: string;
  /** Para formularios no controlados. */
  defaultValue?: string | number | null;
  /** Para campos controlados: lo que el padre tiene guardado. */
  value?: string | number | null;
  /** Recibe el número plano en texto («169261»), o "" si el campo quedó vacío. */
  onValorChange?: (valor: string) => void;
  /** Muestra el importe entendido debajo. Se apaga en los campos de una fila. */
  ayuda?: boolean;
  /** Los pesos se guardan enteros, así que la ayuda muestra el redondeo. */
  moneda?: boolean;
}

/**
 * Campo para escribir plata y cantidades.
 *
 * Es un campo de texto, no un `type="number"`: el navegador solo entiende el
 * formato del inglés, y con eso «169.261,00» quedaba vacío y «169.261» se
 * guardaba como $169 sin decir nada. Acá se acepta lo que uno escribe y, si
 * usó separadores, se le muestra abajo qué se entendió — que es la única forma
 * de que un redondeo o una lectura rara no pase inadvertida.
 */
export function InputNumero({
  name,
  defaultValue,
  value,
  onValorChange,
  ayuda = true,
  moneda = true,
  className,
  "aria-describedby": describedBy,
  ...props
}: Props) {
  const idAyuda = useId();
  const inicial = value ?? defaultValue;
  const textoInicial = inicial === null || inicial === undefined ? "" : String(inicial);

  const [texto, setTexto] = useState(textoInicial);
  // Lo último que le avisamos al padre. Sirve para distinguir un cambio que
  // nació de acá —y entonces hay que seguir mostrando lo que el usuario
  // escribió, con sus puntos— de uno que hizo el padre por su cuenta, como la
  // caja completando sola el primer tramo del pago.
  const [emitido, setEmitido] = useState(() => normalizarNumero(textoInicial));

  const controlado = value !== undefined;
  const delPadre = controlado ? String(value ?? "") : "";
  const mostrado = controlado && delPadre !== emitido ? delPadre : texto;

  const numero = parsearNumero(mostrado);
  const normalizado = numero === null ? "" : String(numero);
  const mostrarAyuda = ayuda && numero !== null && tieneSeparadores(mostrado);

  function alEscribir(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    const plano = normalizarNumero(v);
    setTexto(v);
    setEmitido(plano);
    onValorChange?.(plano);
  }

  return (
    <>
      <Input
        {...props}
        type="text"
        // `decimal` levanta el teclado numérico con coma en el celular, que es
        // donde más se carga. `numeric` no la ofrece.
        inputMode="decimal"
        autoComplete="off"
        value={mostrado}
        onChange={alEscribir}
        className={className}
        aria-describedby={[describedBy, mostrarAyuda ? idAyuda : null].filter(Boolean).join(" ") || undefined}
      />
      {/* El valor que viaja al servidor va siempre sin separadores, escriba
          como escriba el usuario. */}
      {name && <input type="hidden" name={name} value={normalizado} />}
      {mostrarAyuda && (
        <p id={idAyuda} className="text-caption text-muted-foreground" aria-live="polite">
          Se guarda{" "}
          {moneda
            ? // Los pesos se guardan enteros en toda la app, así que la ayuda
              // muestra el redondeo en vez de dejarlo para la sorpresa.
              money(Math.round(numero))
            : numero.toLocaleString("es-AR", { maximumFractionDigits: 2 })}
        </p>
      )}
    </>
  );
}
