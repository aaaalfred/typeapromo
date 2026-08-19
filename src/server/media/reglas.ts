/**
 * Reglas de producto y validación de imágenes. **Lógica pura**: no toca la base
 * de datos, ni el almacén, ni Sharp. Todo lo que decide si unos bytes entran
 * vive aquí para que sea trivialmente testeable.
 *
 * Dos invariantes que no son negociables:
 *
 * 1. **El MIME lo deciden los bytes, no el cliente.** `Content-Type` viaja en la
 *    petición y lo controla quien sube el archivo; se usa únicamente para firmar
 *    la URL de carga. La decisión real se toma con la firma binaria del objeto
 *    ya almacenado (`detectarFormato`).
 * 2. **Las dimensiones se comprueban antes de decodificar** (PLAN.md · §2.8).
 *    `leerDimensiones` lee la cabecera del contenedor —SOF de JPEG, IHDR de PNG,
 *    el chunk VP8 de WebP— sin descomprimir un solo píxel. Una «decompression
 *    bomb» de 60 000 × 60 000 px declara ese tamaño en su cabecera y se rechaza
 *    ahí, antes de que Sharp reserve 14 GB. `limitInputPixels` es la segunda
 *    barrera, no la primera.
 */

/** Formatos de entrada admitidos (PR.md · «Cloudflare R2» → Reglas). */
export const MIMES_ADMITIDOS = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type MimeAdmitido = (typeof MIMES_ADMITIDOS)[number];

/** Tamaño máximo del original: 8 MB. */
export const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024;

/**
 * Techo de píxeles. Es lo que se pasa a `limitInputPixels` y lo que se
 * comprueba contra la cabecera. 40 MP deja pasar cualquier cámara razonable y
 * corta muy por debajo de lo que hace daño.
 */
export const PIXELES_MAXIMOS = 40_000_000;

/** Lado máximo admitido. Una imagen de 30 000 px de ancho no es un caso de uso. */
export const DIMENSION_MAXIMA = 12_000;

/** Formatos que sabemos reconocer, admitidos o no. */
export type FormatoDetectado =
  | MimeAdmitido
  | 'image/gif'
  | 'image/svg+xml'
  | 'image/avif'
  | 'image/heic'
  | 'image/tiff'
  | 'image/bmp'
  | 'image/x-icon'
  | 'application/pdf'
  | 'desconocido';

export function esMimeAdmitido(valor: string): valor is MimeAdmitido {
  return (MIMES_ADMITIDOS as readonly string[]).includes(valor);
}

/* -------------------------------------------------------------------------- */
/* Firma binaria                                                               */
/* -------------------------------------------------------------------------- */

function empiezaPor(bytes: Buffer, hex: string): boolean {
  const longitud = hex.length / 2;
  return (
    bytes.length >= longitud && bytes.subarray(0, longitud).toString('hex') === hex
  );
}

function ascii(bytes: Buffer, inicio: number, fin: number): string {
  return bytes.length >= fin ? bytes.subarray(inicio, fin).toString('ascii') : '';
}

/** Marcas de ISO-BMFF (`ftyp`) que corresponden a imágenes modernas. */
const MARCAS_ISOBMFF: Readonly<Record<string, FormatoDetectado>> = {
  avif: 'image/avif',
  avis: 'image/avif',
  heic: 'image/heic',
  heix: 'image/heic',
  hevc: 'image/heic',
  mif1: 'image/heic',
  msf1: 'image/heic',
};

/**
 * SVG no tiene firma binaria: es texto. Se mira el principio del archivo
 * ignorando BOM, espacios, declaración XML, doctype y comentarios. No hace falta
 * ser exhaustivo —el formato está prohibido, así que basta con reconocerlo para
 * dar un mensaje honesto en vez de «formato desconocido»—, pero sí no dar falsos
 * positivos sobre datos binarios.
 */
function pareceSvg(bytes: Buffer): boolean {
  const cabecera = bytes.subarray(0, 1024);
  // Un binario real trae bytes nulos casi siempre; el texto XML nunca.
  if (cabecera.includes(0x00)) return false;
  const crudo = cabecera.toString('utf8');
  // Se descarta el BOM (U+FEFF) antes de mirar el primer carácter útil.
  const texto = (crudo.codePointAt(0) === 0xfeff ? crudo.slice(1) : crudo).trimStart();
  if (texto.startsWith('<svg')) return true;
  if (!texto.startsWith('<?xml') && !texto.startsWith('<!DOCTYPE')) return false;
  return /<svg[\s>]/i.test(texto);
}

/**
 * Formato real de unos bytes, leído de su firma. Nunca consulta el
 * `Content-Type` declarado.
 */
export function detectarFormato(bytes: Buffer): FormatoDetectado {
  if (empiezaPor(bytes, 'ffd8ff')) return 'image/jpeg';
  if (empiezaPor(bytes, '89504e470d0a1a0a')) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  const marcaGif = ascii(bytes, 0, 6);
  if (marcaGif === 'GIF87a' || marcaGif === 'GIF89a') return 'image/gif';

  if (ascii(bytes, 4, 8) === 'ftyp') {
    const marca = ascii(bytes, 8, 12).toLowerCase();
    const formato = MARCAS_ISOBMFF[marca];
    if (formato !== undefined) return formato;
  }

  if (empiezaPor(bytes, '49492a00') || empiezaPor(bytes, '4d4d002a')) return 'image/tiff';
  if (empiezaPor(bytes, '424d')) return 'image/bmp';
  if (empiezaPor(bytes, '00000100')) return 'image/x-icon';
  if (empiezaPor(bytes, '25504446')) return 'application/pdf';

  if (pareceSvg(bytes)) return 'image/svg+xml';

  return 'desconocido';
}

/** Mensaje en español para un formato que no se admite. */
export function motivoDeRechazo(formato: FormatoDetectado): string {
  switch (formato) {
    case 'image/svg+xml':
      return 'Los archivos SVG no se admiten: pueden contener scripts y no son seguros de servir. Sube la imagen en JPEG, PNG o WebP.';
    case 'image/gif':
      return 'Los GIF no se admiten por rendimiento y accesibilidad. Sube la imagen en JPEG, PNG o WebP.';
    case 'desconocido':
      return 'El archivo no es una imagen JPEG, PNG o WebP.';
    default:
      return `El formato ${formato} no se admite. Sube la imagen en JPEG, PNG o WebP.`;
  }
}

/* -------------------------------------------------------------------------- */
/* Dimensiones leídas de la cabecera, sin decodificar                          */
/* -------------------------------------------------------------------------- */

export interface Dimensiones {
  width: number;
  height: number;
}

/**
 * JPEG: se recorren los segmentos hasta el primer SOF (`FFC0`–`FFCF` salvo
 * `FFC4` DHT, `FFC8` JPG y `FFCC` DAC), cuyo payload es
 * `precisión(1) alto(2) ancho(2)`.
 */
function dimensionesJpeg(bytes: Buffer): Dimensiones | null {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes.readUInt8(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    const marcador = bytes.readUInt8(offset + 1);

    // Relleno `FF FF` y marcadores sin payload (RSTn, SOI, EOI, TEM).
    if (marcador === 0xff) {
      offset += 1;
      continue;
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd9)) {
      offset += 2;
      continue;
    }
    // `SOS`: empiezan los datos comprimidos; ya no habrá cabecera de tamaño.
    if (marcador === 0xda) return null;

    const longitud = bytes.readUInt16BE(offset + 2);
    if (longitud < 2) return null;

    const esSof =
      marcador >= 0xc0 &&
      marcador <= 0xcf &&
      marcador !== 0xc4 &&
      marcador !== 0xc8 &&
      marcador !== 0xcc;

    if (esSof) {
      if (offset + 9 > bytes.length) return null;
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + longitud;
  }
  return null;
}

/** PNG: `IHDR` es siempre el primer chunk; ancho y alto en los bytes 16 y 20. */
function dimensionesPng(bytes: Buffer): Dimensiones | null {
  if (bytes.length < 24) return null;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * WebP: tras la cabecera RIFF (12 bytes) viene el chunk, con tres variantes.
 *
 * - `VP8 ` (con pérdida): código de sincronismo `9D 01 2A` y luego dos enteros
 *   de 16 bits en little-endian de los que solo cuentan 14 bits.
 * - `VP8L` (sin pérdida): firma `0x2F` y 28 bits empaquetados con ancho-1 y
 *   alto-1.
 * - `VP8X` (extendido): ancho-1 y alto-1 del lienzo, 24 bits little-endian.
 */
function dimensionesWebp(bytes: Buffer): Dimensiones | null {
  if (bytes.length < 21) return null;
  const chunk = bytes.subarray(12, 16).toString('ascii');

  if (chunk === 'VP8 ') {
    if (bytes.length < 30) return null;
    if (bytes.subarray(23, 26).toString('hex') !== '9d012a') return null;
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunk === 'VP8L') {
    if (bytes.length < 25) return null;
    if (bytes.readUInt8(20) !== 0x2f) return null;
    const empaquetado = bytes.readUInt32LE(21);
    return {
      width: (empaquetado & 0x3fff) + 1,
      height: ((empaquetado >>> 14) & 0x3fff) + 1,
    };
  }

  if (chunk === 'VP8X') {
    if (bytes.length < 30) return null;
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }

  return null;
}

/**
 * Ancho y alto declarados en la cabecera del contenedor, o `null` si no se
 * pueden leer. **No decodifica.**
 */
export function leerDimensiones(bytes: Buffer, formato: MimeAdmitido): Dimensiones | null {
  switch (formato) {
    case 'image/jpeg':
      return dimensionesJpeg(bytes);
    case 'image/png':
      return dimensionesPng(bytes);
    case 'image/webp':
      return dimensionesWebp(bytes);
    default:
      return null;
  }
}

export type ResultadoDimensiones =
  | { valido: true; dimensiones: Dimensiones }
  | { valido: false; motivo: string };

/** Comprueba lado mínimo, lado máximo y total de píxeles. */
export function validarDimensiones(
  dimensiones: Dimensiones | null,
): ResultadoDimensiones {
  if (dimensiones === null) {
    return {
      valido: false,
      motivo: 'No se han podido leer las dimensiones de la imagen: el archivo está incompleto o dañado.',
    };
  }

  const { width, height } = dimensiones;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return { valido: false, motivo: 'La imagen declara unas dimensiones imposibles.' };
  }

  if (width > DIMENSION_MAXIMA || height > DIMENSION_MAXIMA) {
    return {
      valido: false,
      motivo: `La imagen mide ${width}×${height} px y el lado máximo admitido es de ${DIMENSION_MAXIMA} px.`,
    };
  }

  if (width * height > PIXELES_MAXIMOS) {
    return {
      valido: false,
      motivo: `La imagen tiene ${width * height} píxeles y el máximo admitido es de ${PIXELES_MAXIMOS}.`,
    };
  }

  return { valido: true, dimensiones: { width, height } };
}

/* -------------------------------------------------------------------------- */
/* Tamaño                                                                      */
/* -------------------------------------------------------------------------- */

export type ResultadoTamano = { valido: true } | { valido: false; motivo: string };

export function validarTamano(byteSize: number): ResultadoTamano {
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    return { valido: false, motivo: 'El archivo está vacío.' };
  }
  if (byteSize > TAMANO_MAXIMO_BYTES) {
    return {
      valido: false,
      motivo: `El archivo ocupa ${formatearMegas(byteSize)} y el máximo admitido son ${formatearMegas(TAMANO_MAXIMO_BYTES)}.`,
    };
  }
  return { valido: true };
}

/** Formatea bytes como megabytes con un decimal, para mensajes de usuario. */
export function formatearMegas(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
