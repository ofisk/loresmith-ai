import { vi } from "vitest";

// Global mocks to prevent ajv import issues
vi.mock("ajv", () => ({
  default: class MockAjv {
    addSchema() {}
    validate() {
      return true;
    }
  },
}));

vi.mock("ajv-formats", () => ({
  default: vi.fn(),
}));
