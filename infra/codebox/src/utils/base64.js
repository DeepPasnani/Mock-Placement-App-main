export function decodeIfNeeded(str, isEncoded) {
  if (!str) return str;
  if (isEncoded) {
    try {
      return Buffer.from(str, 'base64').toString('utf-8');
    } catch {
      return str;
    }
  }
  return str;
}

export function encodeIfNeeded(str, shouldEncode) {
  if (str === null || str === undefined) return null;
  if (shouldEncode) {
    return Buffer.from(String(str), 'utf-8').toString('base64');
  }
  return str;
}
