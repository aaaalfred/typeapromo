/**
 * Imágenes mínimas construidas byte a byte.
 *
 * Se generan a mano en lugar de guardar ficheros binarios en el repositorio por
 * dos razones: los tests de firma binaria y de lectura de cabecera necesitan
 * poder **mentir** (declarar 60 000 px sin ocupar 60 000 px, poner un PNG dentro
 * de algo que dice ser JPEG), y un `.png` en el árbol de tests es opaco: nadie
 * sabe qué contiene sin abrirlo.
 */

/** JPEG: SOI, un APP0 de relleno, un SOF0 con las dimensiones y SOS. */
export function jpegFalso(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);

  const app0 = Buffer.alloc(4 + 14);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write('JFIF\0', 4, 'ascii');

  const sof0 = Buffer.alloc(4 + 6);
  sof0.writeUInt16BE(0xffc0, 0);
  sof0.writeUInt16BE(11, 2); // longitud del segmento, sin contar el marcador
  sof0.writeUInt8(8, 4); // precisión
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  sof0.writeUInt8(1, 9); // número de componentes

  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);

  return Buffer.concat([soi, app0, sof0, sos, Buffer.from([0xff, 0xd9])]);
}

/** PNG: firma de 8 bytes y un IHDR con ancho y alto. */
export function pngFalso(width: number, height: number): Buffer {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16); // profundidad de bits
  ihdr.writeUInt8(6, 17); // tipo de color RGBA
  return Buffer.concat([firma, ihdr]);
}

/** WebP con pérdida: RIFF + WEBP + chunk `VP8 ` con el código de sincronismo. */
export function webpLossyFalso(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8 ', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUInt8(0x9d, 23);
  buffer.writeUInt8(0x01, 24);
  buffer.writeUInt8(0x2a, 25);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

/** WebP sin pérdida: chunk `VP8L` con ancho-1 y alto-1 empaquetados en 28 bits. */
export function webpLosslessFalso(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(25);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(17, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8L', 12, 'ascii');
  buffer.writeUInt32LE(5, 16);
  buffer.writeUInt8(0x2f, 20);
  buffer.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  return buffer;
}

/** WebP extendido: chunk `VP8X` con el tamaño del lienzo en 24 bits. */
export function webpExtendidoFalso(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8X', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

/** GIF89a mínimo. Prohibido por producto: el test comprueba que se reconoce. */
export function gifFalso(): Buffer {
  const cabecera = Buffer.from('GIF89a', 'ascii');
  const pantalla = Buffer.alloc(7);
  pantalla.writeUInt16LE(1, 0);
  pantalla.writeUInt16LE(1, 2);
  return Buffer.concat([cabecera, pantalla]);
}

/** SVG con un `onload`: el caso exacto por el que el formato está prohibido. */
export function svgFalso(): Buffer {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"><rect width="10" height="10"/></svg>',
    'utf8',
  );
}

/** SVG precedido de declaración XML, BOM y comentario. */
export function svgConPreambuloFalso(): Buffer {
  return Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- generado -->\n<svg xmlns="http://www.w3.org/2000/svg"/>',
      'utf8',
    ),
  ]);
}

export function avifFalso(): Buffer {
  const buffer = Buffer.alloc(16);
  buffer.writeUInt32BE(12, 0);
  buffer.write('ftyp', 4, 'ascii');
  buffer.write('avif', 8, 'ascii');
  return buffer;
}

export function pdfFalso(): Buffer {
  return Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1');
}
