import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";

// Custom matchers (since jest-dom may not be available)
declare module "vitest" {
  interface Assertion<T = any> {
    toBeInTheDocument(): T;
    toHaveValue(expected: string): T;
    toBeDisabled(): T;
  }
}

expect.extend({
  toBeInTheDocument(received: any) {
    const pass =
      received !== null &&
      received !== undefined &&
      typeof received === "object" &&
      "ownerDocument" in received &&
      received.ownerDocument &&
      received.ownerDocument.contains(received as Node);

    if (pass) {
      return {
        message: () => `expected element not to be in document`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected element to be in document`,
        pass: false,
      };
    }
  },
  toHaveValue(received: any, expected: string) {
    const actual =
      (received as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement)
        ?.value || "";
    const pass = actual === expected;

    if (pass) {
      return {
        message: () => `expected element not to have value "${expected}"`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected element to have value "${expected}", but got "${actual}"`,
        pass: false,
      };
    }
  },
  toBeDisabled(received: any) {
    const element = received as HTMLElement;
    const pass =
      element.hasAttribute("disabled") ||
      (element as HTMLInputElement | HTMLButtonElement)?.disabled === true;

    if (pass) {
      return {
        message: () => `expected element not to be disabled`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected element to be disabled`,
        pass: false,
      };
    }
  },
});

// Cleanup after each test
afterEach(() => {
  cleanup();
});
