function toHex(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < b.length; i++) out += b[i]!.toString(16).padStart(2, '0');
  return out;
}

function fnv1a32(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193);
  }
  // uint32
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function sha256HexFromBlob(blob: Blob): Promise<string> {
  try {
    const ab = await blob.arrayBuffer();
    const subtle = (globalThis.crypto as any)?.subtle as SubtleCrypto | undefined;
    if (subtle?.digest) {
      const digest = await subtle.digest('SHA-256', ab);
      return toHex(digest);
    }
    return `fnv1a32:${fnv1a32(new Uint8Array(ab))}:${ab.byteLength}`;
  } catch {
    // last resort: unstable key
    return `blob:${Date.now()}`;
  }
}

