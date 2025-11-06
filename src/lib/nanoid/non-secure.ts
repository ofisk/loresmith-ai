/**
 * Non-secure version of nanoid (uses Math.random instead of crypto.getRandomValues)
 * This is what the AI SDK imports as 'nanoid/non-secure'
 */

// Non-secure nanoid function
export function nanoid(size: number = 21): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < size; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// Non-secure custom alphabet function
export function customAlphabet(
  alphabet: string,
  defaultSize: number = 21
): (size?: number) => string {
  return (size: number = defaultSize) => {
    let result = "";
    for (let i = 0; i < size; i++) {
      result += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return result;
  };
}

// Default export
export default {
  nanoid,
  customAlphabet,
};
