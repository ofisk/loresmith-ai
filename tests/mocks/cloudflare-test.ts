// Mock implementations for cloudflare:test functions
export function createExecutionContext() {
  return {
    waitUntil: (promise: Promise<any>) => {
      // Mock implementation
      return promise;
    },
    passThroughOnException: () => {
      // Mock implementation
    },
    props: {},
  };
}

export function waitOnExecutionContext(_ctx: any) {
  // Mock implementation - just return a resolved promise
  return Promise.resolve();
}
