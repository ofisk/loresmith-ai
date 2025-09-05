// Minimal node polyfills for Cloudflare Workers
// This file provides empty implementations for Node.js modules
// that are not available in the Cloudflare Workers runtime

// Empty implementations for Node.js modules
export const EventEmitter = class {};
export const Readable = class {};
export const Writable = class {};
export const Transform = class {};
export const PassThrough = class {};

// Process polyfill
export const process = {
  env: {},
  nextTick: (callback: () => void) => setTimeout(callback, 0),
  version: "v18.0.0",
  platform: "cloudflare",
};

// TTY polyfill
export const isatty = () => false;
export const ReadStream = class {};
export const WriteStream = class {};

// Async hooks polyfill
export const AsyncLocalStorage = class {};
export const AsyncResource = class {};

// Default export
export default {
  EventEmitter,
  Readable,
  Writable,
  Transform,
  PassThrough,
  process,
  isatty,
  ReadStream,
  WriteStream,
  AsyncLocalStorage,
  AsyncResource,
};
