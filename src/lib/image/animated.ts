/**
 * Détection d'images animées (GIF/WebP) par inspection d'octets.
 *
 * Aucun décodage d'image, aucune bibliothèque externe, aucun drawImage.
 * Retourne `false` pour les formats non animés ou les entrées invalides
 * sans lever d'erreur.
 */

const GIF_HEADER = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
const GIF_EXTENSION_INTRODUCER = 0x21;
const GIF_APPLICATION_EXTENSION = 0xff;
const GIF_IMAGE_DESCRIPTOR = 0x2c;

const RIFF_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF
const WEBP_HEADER = new Uint8Array([0x57, 0x45, 0x42, 0x50]); // WEBP
const ANIM_CHUNK = new Uint8Array([0x41, 0x4e, 0x49, 0x4d]); // ANIM

/**
 * Lit le contenu d'un Blob en ArrayBuffer via FileReader
 * (compatible jsdom où Blob.arrayBuffer() n'est pas disponible).
 */
function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () =>
      reject(new Error("Impossible de lire le blob."));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Retourne `true` si le fichier est une image animée (GIF ou WebP).
 * Retourne `false` pour les formats statiques (PNG, JPEG…) ou en cas
 * d'erreur de lecture.
 */
export async function isAnimatedImage(file: File | Blob): Promise<boolean> {
  try {
    const buffer = await readBlobAsArrayBuffer(file);
    const bytes = new Uint8Array(buffer);

    if (bytes.length < 12) {
      return false;
    }

    if (matchesHeader(bytes, GIF_HEADER)) {
      return isAnimatedGif(bytes);
    }

    if (
      matchesHeader(bytes, RIFF_HEADER) &&
      bytes.length >= 12 &&
      matchesHeader(bytes.slice(8, 12), WEBP_HEADER)
    ) {
      return isAnimatedWebp(bytes);
    }

    return false;
  } catch {
    return false;
  }
}

function matchesHeader(bytes: Uint8Array, header: Uint8Array): boolean {
  if (bytes.length < header.length) return false;
  for (let i = 0; i < header.length; i++) {
    if (bytes[i] !== header[i]) return false;
  }
  return true;
}

/**
 * Détecte l'animation GIF via le bloc d'extension NETSCAPE2.0
 * (0x21 0xFF 0x0B suivi de "NETSCAPE2.0").
 * Alternative : compter les descripteurs d'image (0x2C) — ≥2 = animé.
 */
function isAnimatedGif(bytes: Uint8Array): boolean {
  // Recherche du bloc NETSCAPE2.0
  const netscapePrefix = [0x21, 0xff, 0x0b];
  for (let i = 0; i < bytes.length - netscapePrefix.length - 10; i++) {
    if (
      bytes[i] === netscapePrefix[0] &&
      bytes[i + 1] === netscapePrefix[1] &&
      bytes[i + 2] === netscapePrefix[2]
    ) {
      const textBytes = bytes.slice(i + 3, i + 3 + 11);
      const text = String.fromCharCode(...textBytes);
      if (text === "NETSCAPE2.0") {
        return true;
      }
    }
  }

  // Fallback : compter les descripteurs d'image (0x2C)
  let count = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === GIF_IMAGE_DESCRIPTOR) {
      count++;
      if (count >= 2) return true;
    }
  }

  return false;
}

/**
 * Parcourt les chunks WebP à la recherche d'un chunk ANIM.
 * Format chunk : 4 octets taille (little-endian, incluse) + 4 octets FourCC + données.
 */
function isAnimatedWebp(bytes: Uint8Array): boolean {
  let pos = 12; // Après l'en-tête RIFF(4) + taille(4) + WEBP(4)

  while (pos < bytes.length - 8) {
    const chunkSize =
      bytes[pos] |
      (bytes[pos + 1] << 8) |
      (bytes[pos + 2] << 16) |
      (bytes[pos + 3] << 24);

    const fourcc = bytes.slice(pos + 4, pos + 8);
    if (matchesHeader(fourcc, ANIM_CHUNK)) {
      return true;
    }

    // Avancer au chunk suivant (8 octets d'en-tête + données)
    pos += 8 + chunkSize;

    // Padding impair si la taille du chunk est impaire
    if (chunkSize % 2 !== 0) {
      pos += 1;
    }
  }

  return false;
}
