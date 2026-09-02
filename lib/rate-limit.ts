/**
 * Limitador de intentos en memoria para el login.
 *
 * Alcance: protege contra el caso realista — alguien probando contraseñas contra
 * esta instancia. Al vivir en memoria, se reinicia con el servidor y no se
 * comparte entre instancias; para un panel de un solo administrador es
 * suficiente. Si algún día esto corre en varias réplicas, hay que moverlo a la
 * base o a un Redis.
 */

interface Registro {
  intentos: number;
  primerIntento: number;
  bloqueadoHasta?: number;
}

const registros = new Map<string, Registro>();

const VENTANA_MS = 1000 * 60 * 15; // 15 minutos
const MAX_INTENTOS = 5;
const BLOQUEOS_MS = [
  1000 * 60,      // 1º bloqueo: 1 minuto
  1000 * 60 * 5,  // 2º: 5 minutos
  1000 * 60 * 30, // 3º en adelante: 30 minutos
];

function limpiarVencidos(ahora: number) {
  for (const [clave, r] of registros) {
    const vencido = ahora - r.primerIntento > VENTANA_MS;
    const desbloqueado = !r.bloqueadoHasta || ahora > r.bloqueadoHasta;
    if (vencido && desbloqueado) registros.delete(clave);
  }
}

export interface ResultadoLimite {
  permitido: boolean;
  segundosRestantes: number;
  intentosRestantes: number;
}

/** Consulta si una identidad puede intentar autenticarse ahora. No consume intento. */
export function verificarLimite(clave: string): ResultadoLimite {
  const ahora = Date.now();
  if (registros.size > 500) limpiarVencidos(ahora);

  const r = registros.get(clave);
  if (!r) return { permitido: true, segundosRestantes: 0, intentosRestantes: MAX_INTENTOS };

  if (r.bloqueadoHasta && ahora < r.bloqueadoHasta) {
    return {
      permitido: false,
      segundosRestantes: Math.ceil((r.bloqueadoHasta - ahora) / 1000),
      intentosRestantes: 0,
    };
  }

  if (ahora - r.primerIntento > VENTANA_MS) {
    registros.delete(clave);
    return { permitido: true, segundosRestantes: 0, intentosRestantes: MAX_INTENTOS };
  }

  return {
    permitido: true,
    segundosRestantes: 0,
    intentosRestantes: Math.max(0, MAX_INTENTOS - r.intentos),
  };
}

/** Registra un intento fallido y aplica bloqueo escalonado al superar el máximo. */
export function registrarFallo(clave: string): ResultadoLimite {
  const ahora = Date.now();
  const previo = registros.get(clave);

  const r: Registro =
    previo && ahora - previo.primerIntento <= VENTANA_MS
      ? { ...previo, intentos: previo.intentos + 1 }
      : { intentos: 1, primerIntento: ahora };

  if (r.intentos >= MAX_INTENTOS) {
    const nivel = Math.min(Math.floor(r.intentos / MAX_INTENTOS) - 1, BLOQUEOS_MS.length - 1);
    r.bloqueadoHasta = ahora + (BLOQUEOS_MS[nivel] ?? BLOQUEOS_MS[BLOQUEOS_MS.length - 1]!);
  }

  registros.set(clave, r);

  return {
    permitido: !r.bloqueadoHasta || ahora >= r.bloqueadoHasta,
    segundosRestantes: r.bloqueadoHasta ? Math.ceil((r.bloqueadoHasta - ahora) / 1000) : 0,
    intentosRestantes: Math.max(0, MAX_INTENTOS - r.intentos),
  };
}

/** Login exitoso: se borra el historial de fallos. */
export function limpiarIntentos(clave: string) {
  registros.delete(clave);
}
