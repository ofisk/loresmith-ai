// nanoid polyfill for Cloudflare Workers
// This provides working implementations to avoid hoisting issues

/**
 * Generate a random ID using a secure random generator
 */
export function nanoid(size: number = 21): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  // Use crypto.getRandomValues if available, fallback to Math.random
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint8Array(size);
    crypto.getRandomValues(array);
    for (let i = 0; i < size; i++) {
      result += chars[array[i] % chars.length];
    }
  } else {
    for (let i = 0; i < size; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }

  return result;
}

/**
 * Create a custom alphabet-based ID generator
 */
export function customAlphabet(
  alphabet: string,
  defaultSize: number = 21
): (size?: number) => string {
  return (size: number = defaultSize) => {
    let result = "";

    // Use crypto.getRandomValues if available, fallback to Math.random
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const array = new Uint8Array(size);
      crypto.getRandomValues(array);
      for (let i = 0; i < size; i++) {
        result += alphabet[array[i] % alphabet.length];
      }
    } else {
      for (let i = 0; i < size; i++) {
        result += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }

    return result;
  };
}

// Default export for compatibility
export default {
  nanoid,
  customAlphabet,
};
