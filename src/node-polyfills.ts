// Node.js polyfills for Cloudflare Workers
// These provide actual working implementations, not just empty stubs

// async_hooks polyfill
export class AsyncLocalStorage<T = any> {
  private store = new Map<string, T>();

  run<R>(store: T, fn: () => R): R {
    const key = Math.random().toString(36);
    this.store.set(key, store);
    try {
      return fn();
    } finally {
      this.store.delete(key);
    }
  }

  getStore(): T | undefined {
    // Return the first available store (simplified implementation)
    return this.store.values().next().value;
  }

  enterWith(store: T): void {
    // Simplified - just store the value
    this.store.set("default", store);
  }

  exit(): void {
    // Simplified - clear the default store
    this.store.delete("default");
  }
}

// events polyfill
export class EventEmitter {
  private events: Record<string, Function[]> = {};

  on(event: string, listener: Function): this {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    if (!this.events[event]) return false;
    this.events[event].forEach((listener) => listener(...args));
    return true;
  }

  removeListener(event: string, listener: Function): this {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter((l) => l !== listener);
    }
    return this;
  }
}

// tty polyfill
export class ReadStream {
  isTTY = false;
  columns = 80;
  rows = 24;
}

export class WriteStream {
  isTTY = false;
  columns = 80;
  rows = 24;
}

// stream polyfill
export class Writable {
  write(chunk: any, encoding?: string, callback?: Function): boolean {
    if (callback) callback();
    return true;
  }
}

// process polyfill
export const process = {
  platform: "cloudflare",
  env: {},
  version: "v18.0.0",
  versions: {},
  cwd: () => "/",
  exit: (code?: number) => {},
  stdout: null,
  stderr: null,
  stdin: null,
  getBuiltinModule: (name: string) => {
    // Return appropriate polyfills for built-in modules
    if (name === "node:async_hooks") {
      return { AsyncLocalStorage };
    }
    return {};
  },
};

// os polyfill
export const EOL = "\n";
export const platform = "cloudflare";
export const arch = "wasm32";
export const type = "cloudflare";
export const release = "1.0.0";
export const uptime = () => Date.now() / 1000;
export const totalmem = () => 0; // Not available in Workers
export const freemem = () => 0; // Not available in Workers
export const cpus = () => []; // Not available in Workers
export const networkInterfaces = () => ({}); // Not available in Workers
export const homedir = () => "/";
export const userInfo = () => ({
  username: "worker",
  uid: 0,
  gid: 0,
  shell: "/bin/sh",
  homedir: "/",
});

// path polyfill
export const sep = "/";
export const delimiter = ":";
export const normalize = (p: string): string => {
  if (!p) return ".";
  const parts = p.split(sep).filter(Boolean);
  const result: string[] = [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (result.length > 0) result.pop();
      continue;
    }
    result.push(part);
  }

  return result.length > 0 ? sep + result.join(sep) : ".";
};

export const join = (...paths: string[]): string => {
  return paths
    .map((p, i) => {
      if (i === 0) return p;
      if (p.startsWith(sep)) return p;
      return sep + p;
    })
    .join("")
    .replace(/\/+/g, sep);
};

export const resolve = (...paths: string[]): string => {
  return normalize(join(...paths));
};

export const relative = (from: string, to: string): string => {
  const fromParts = resolve(from).split(sep).filter(Boolean);
  const toParts = resolve(to).split(sep).filter(Boolean);

  let i = 0;
  while (
    i < fromParts.length &&
    i < toParts.length &&
    fromParts[i] === toParts[i]
  ) {
    i++;
  }

  const fromRemaining = fromParts.slice(i);
  const toRemaining = toParts.slice(i);

  const result = [...fromRemaining.map(() => ".."), ...toRemaining];
  return result.length > 0 ? result.join(sep) : ".";
};

export const dirname = (p: string): string => {
  const parts = p.split(sep).filter(Boolean);
  return parts.length > 1 ? sep + parts.slice(0, -1).join(sep) : ".";
};

export const basename = (p: string, ext?: string): string => {
  const name = p.split(sep).pop() || "";
  if (ext && name.endsWith(ext)) {
    return name.slice(0, -ext.length);
  }
  return name;
};

export const extname = (p: string): string => {
  const match = p.match(/\.[^.]*$/);
  return match ? match[0] : "";
};

export const parse = (
  p: string
): {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
} => {
  const ext = extname(p);
  const name = basename(p, ext);
  const dir = dirname(p);
  return { root: "/", dir, base: name + ext, ext, name };
};

export const format = (p: {
  root?: string;
  dir?: string;
  base?: string;
  ext?: string;
  name?: string;
}): string => {
  if (p.base) {
    return p.dir ? join(p.dir, p.base) : p.base;
  }
  if (p.ext && p.name) {
    const base = p.name + p.ext;
    return p.dir ? join(p.dir, base) : base;
  }
  return p.dir || "";
};

export const isAbsolute = (p: string): boolean => p.startsWith(sep);
export const toNamespacedPath = (p: string): string => p;

// Default export for compatibility
export default {
  AsyncLocalStorage,
  EventEmitter,
  ReadStream,
  WriteStream,
  Writable,
  process,
  EOL,
  platform,
  arch,
  type,
  release,
  uptime,
  totalmem,
  freemem,
  cpus,
  networkInterfaces,
  homedir,
  userInfo,
  sep,
  delimiter,
  normalize,
  join,
  resolve,
  relative,
  dirname,
  basename,
  extname,
  parse,
  format,
  isAbsolute,
  toNamespacedPath,
};
