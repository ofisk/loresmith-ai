/**
 * Nanoid-compatible module for Cloudflare Workers
 * Provides the exact exports that AI SDK packages expect
 */

// Main nanoid function
export function nanoid(size: number = 21): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(size);
  crypto.getRandomValues(array);

  let result = "";
  for (let i = 0; i < size; i++) {
    result += chars[array[i] % chars.length];
  }

  return result;
}

// Custom alphabet function
export function customAlphabet(
  alphabet: string,
  defaultSize: number = 21
): (size?: number) => string {
  return (size: number = defaultSize) => {
    const array = new Uint8Array(size);
    crypto.getRandomValues(array);

    let result = "";
    for (let i = 0; i < size; i++) {
      result += alphabet[array[i] % alphabet.length];
    }

    return result;
  };
}

// Default export
export default {
  nanoid,
  customAlphabet,
};
