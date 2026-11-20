/**
 * lib/trivias/qr.ts — el QR de la partida, sin dependencias.
 *
 * Nexus no tenía librería de QR y sumar una obliga a `npm install` en las dos PCs y en el
 * contenedor; para un enlace de ~50 caracteres alcanza un codificador chico: modo byte (UTF-8),
 * corrección de errores nivel M y versiones 1 a 10 (hasta 213 bytes). Sigue la norma ISO/IEC 18004
 * paso por paso: bits de datos → bloques con Reed-Solomon → patrones fijos → módulos en zigzag →
 * la máscara con menos penalización. Lo devuelve como matriz de booleanos (true = módulo oscuro);
 * el componente la dibuja en SVG. Las pruebas (qr.test.ts) fijan los vectores conocidos de la norma (Reed-Solomon y
 * bits de formato y de versión) y dos QR congelados que decodificó un lector independiente (jsQR).
 */

/** Codewords de corrección por bloque (nivel M), por versión 1..10. */
const EC_POR_BLOQUE = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
/** Cantidad de bloques (nivel M), por versión 1..10. */
const BLOQUES = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const VERSION_MAXIMA = 10;
/** Bits de formato del nivel M (L=01, M=00, Q=11, H=10). */
const NIVEL_M = 0;

export type MatrizQr = boolean[][];

/** Módulos de datos (sin patrones fijos) de una versión. */
function modulosDeDatos(version: number): number {
  let n = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alineaciones = Math.floor(version / 7) + 2;
    n -= (25 * alineaciones - 10) * alineaciones - 55;
    if (version >= 7) n -= 36;
  }
  return n;
}

function codewordsTotales(version: number): number {
  return Math.floor(modulosDeDatos(version) / 8);
}

function codewordsDeDatos(version: number): number {
  return codewordsTotales(version) - EC_POR_BLOQUE[version] * BLOQUES[version];
}

/** Bytes que entran en una versión, en modo byte (4 bits de modo + 8 o 16 del largo). */
export function capacidadEnBytes(version: number): number {
  const bitsDelLargo = version <= 9 ? 8 : 16;
  return Math.floor((codewordsDeDatos(version) * 8 - 4 - bitsDelLargo) / 8);
}

// ── Reed-Solomon sobre GF(256), polinomio 0x11D ─────────────────────────────

function multiplicar(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisor(grado: number): number[] {
  const r = new Array<number>(grado).fill(0);
  r[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = multiplicar(r[j], raiz);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    raiz = multiplicar(raiz, 0x02);
  }
  return r;
}

/** Codewords de corrección de un bloque de datos. Exportado para probarlo contra la norma. */
export function reedSolomon(datos: readonly number[], grado: number): number[] {
  const div = divisor(grado);
  const r = new Array<number>(grado).fill(0);
  for (const b of datos) {
    const factor = b ^ (r.shift() as number);
    r.push(0);
    for (let i = 0; i < div.length; i++) r[i] ^= multiplicar(div[i], factor);
  }
  return r;
}

// ── Bits de formato y de versión (BCH) ──────────────────────────────────────

/** Los 15 bits de formato (nivel M + máscara), ya enmascarados con 0x5412. */
export function bitsDeFormato(mascara: number): number {
  const datos = (NIVEL_M << 3) | mascara;
  let rem = datos;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((datos << 10) | rem) ^ 0x5412;
}

/** Los 18 bits de versión (solo versión 7 en adelante). */
export function bitsDeVersion(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

/** Centros de los patrones de alineación de una versión. */
export function posicionesDeAlineacion(version: number): number[] {
  if (version === 1) return [];
  const cantidad = Math.floor(version / 7) + 2;
  const lado = version * 4 + 17;
  const paso = Math.ceil((version * 4 + 4) / (cantidad * 2 - 2)) * 2;
  const r = [6];
  for (let pos = lado - 7; r.length < cantidad; pos -= paso) r.splice(1, 0, pos);
  return r;
}

// ── El codificador ──────────────────────────────────────────────────────────

/** Arma los codewords finales (datos + corrección, intercalados) de una versión. */
function codewords(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const poner = (valor: number, largo: number) => {
    for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  poner(0b0100, 4); // modo byte
  poner(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) poner(b, 8);

  const capacidadBits = codewordsDeDatos(version) * 8;
  poner(0, Math.min(4, capacidadBits - bits.length)); // terminador
  poner(0, (8 - (bits.length % 8)) % 8);
  const datos: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    datos.push(b);
  }
  for (let relleno = 0xec; datos.length < codewordsDeDatos(version); relleno ^= 0xec ^ 0x11) {
    datos.push(relleno);
  }

  const cantidadBloques = BLOQUES[version];
  const ec = EC_POR_BLOQUE[version];
  const total = codewordsTotales(version);
  const cortos = cantidadBloques - (total % cantidadBloques);
  const largoCorto = Math.floor(total / cantidadBloques);
  const bloques: number[][] = [];
  for (let i = 0, k = 0; i < cantidadBloques; i++) {
    const largoDatos = largoCorto - ec + (i < cortos ? 0 : 1);
    const dat = datos.slice(k, k + largoDatos);
    k += largoDatos;
    const correccion = reedSolomon(dat, ec);
    // Los bloques cortos llevan un hueco para que el intercalado quede parejo.
    if (i < cortos) dat.push(-1);
    bloques.push(dat.concat(correccion));
  }
  const salida: number[] = [];
  for (let i = 0; i < bloques[0].length; i++) {
    for (const bl of bloques) if (bl[i] !== -1) salida.push(bl[i]);
  }
  return salida;
}

function aplicarMascara(m: MatrizQr, fijo: boolean[][], mascara: number): void {
  const n = m.length;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (fijo[y][x]) continue;
      let invertir: boolean;
      switch (mascara) {
        case 0: invertir = (x + y) % 2 === 0; break;
        case 1: invertir = y % 2 === 0; break;
        case 2: invertir = x % 3 === 0; break;
        case 3: invertir = (x + y) % 3 === 0; break;
        case 4: invertir = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invertir = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invertir = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: invertir = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
      }
      if (invertir) m[y][x] = !m[y][x];
    }
  }
}

/** Penalización de la norma (reglas 1 a 4): la máscara con menos se lee mejor. */
function penalizacion(m: MatrizQr): number {
  const n = m.length;
  let p = 0;
  // Regla 1: corridas de 5+ del mismo color, en filas y columnas.
  for (let eje = 0; eje < 2; eje++) {
    for (let a = 0; a < n; a++) {
      let corrida = 1;
      for (let b = 1; b < n; b++) {
        const actual = eje === 0 ? m[a][b] : m[b][a];
        const previo = eje === 0 ? m[a][b - 1] : m[b - 1][a];
        if (actual === previo) {
          corrida++;
          if (corrida === 5) p += 3;
          else if (corrida > 5) p += 1;
        } else corrida = 1;
      }
    }
  }
  // Regla 2: bloques de 2×2 del mismo color.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
  }
  // Regla 3: el patrón 1011101 con cuatro claros a un lado (parecido a un buscador).
  const patron = [true, false, true, true, true, false, true];
  for (let eje = 0; eje < 2; eje++) {
    for (let a = 0; a < n; a++) {
      for (let b = 0; b + 7 <= n; b++) {
        let coincide = true;
        for (let k = 0; k < 7 && coincide; k++) {
          if ((eje === 0 ? m[a][b + k] : m[b + k][a]) !== patron[k]) coincide = false;
        }
        if (!coincide) continue;
        const claro = (desde: number) => {
          for (let k = desde; k < desde + 4; k++) {
            if (k < 0 || k >= n) continue; // fuera del símbolo cuenta como claro
            if (eje === 0 ? m[a][k] : m[k][a]) return false;
          }
          return true;
        };
        if (claro(b - 4) || claro(b + 7)) p += 40;
      }
    }
  }
  // Regla 4: proporción de oscuros lejos del 50 %.
  let oscuros = 0;
  for (const fila of m) for (const c of fila) if (c) oscuros++;
  const total = n * n;
  p += Math.floor(Math.abs(oscuros * 20 - total * 10) / total) * 10;
  return p;
}

/**
 * Codifica un texto en un QR (nivel M). Elige la versión más chica que alcanza y la máscara con
 * menos penalización, salvo que se fuerce `mascara` (solo para las pruebas).
 */
export function codificarQr(texto: string, opciones: { mascara?: number } = {}): MatrizQr {
  const bytes = new TextEncoder().encode(texto);
  let version = 1;
  while (version <= VERSION_MAXIMA && capacidadEnBytes(version) < bytes.length) version++;
  if (version > VERSION_MAXIMA) {
    throw new Error(`El texto no entra en un QR versión ${VERSION_MAXIMA} (${bytes.length} bytes)`);
  }
  const n = version * 4 + 17;
  const m: MatrizQr = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fijo: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const poner = (x: number, y: number, oscuro: boolean) => {
    m[y][x] = oscuro;
    fijo[y][x] = true;
  };

  // Patrones de sincronía, buscadores y alineación.
  for (let i = 0; i < n; i++) {
    poner(6, i, i % 2 === 0);
    poner(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= n || y < 0 || y >= n) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        poner(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const al = posicionesDeAlineacion(version);
  for (let i = 0; i < al.length; i++) {
    for (let j = 0; j < al.length; j++) {
      const esquina =
        (i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0);
      if (esquina) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          poner(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  const dibujarFormato = (mascara: number) => {
    const f = bitsDeFormato(mascara);
    for (let i = 0; i <= 5; i++) poner(8, i, bit(f, i));
    poner(8, 7, bit(f, 6));
    poner(8, 8, bit(f, 7));
    poner(7, 8, bit(f, 8));
    for (let i = 9; i < 15; i++) poner(14 - i, 8, bit(f, i));
    for (let i = 0; i < 8; i++) poner(n - 1 - i, 8, bit(f, i));
    for (let i = 8; i < 15; i++) poner(8, n - 15 + i, bit(f, i));
    poner(8, n - 8, true); // el módulo oscuro fijo
  };
  dibujarFormato(0); // reserva el lugar; se reescribe con la máscara elegida
  if (version >= 7) {
    const v = bitsDeVersion(version);
    for (let i = 0; i < 18; i++) {
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      poner(a, b, bit(v, i));
      poner(b, a, bit(v, i));
    }
  }

  // Los codewords en zigzag, de a dos columnas, de derecha a izquierda.
  const cw = codewords(bytes, version);
  let i = 0;
  for (let derecha = n - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let v = 0; v < n; v++) {
      for (let j = 0; j < 2; j++) {
        const x = derecha - j;
        const subiendo = ((derecha + 1) & 2) === 0;
        const y = subiendo ? n - 1 - v : v;
        if (fijo[y][x] || i >= cw.length * 8) continue;
        m[y][x] = bit(cw[i >>> 3], 7 - (i & 7));
        i++;
      }
    }
  }

  let elegida = opciones.mascara ?? -1;
  if (elegida < 0) {
    let mejor = Infinity;
    for (let k = 0; k < 8; k++) {
      aplicarMascara(m, fijo, k);
      dibujarFormato(k);
      const p = penalizacion(m);
      if (p < mejor) {
        mejor = p;
        elegida = k;
      }
      aplicarMascara(m, fijo, k); // XOR: aplicarla de nuevo la deshace
    }
  }
  aplicarMascara(m, fijo, elegida);
  dibujarFormato(elegida);
  return m;
}
