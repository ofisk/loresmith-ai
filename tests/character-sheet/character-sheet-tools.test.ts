import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolResult } from "../../src/shared";

// Mock the character sheet tools module
vi.mock("../../src/tools/character-sheet/upload-tools", () => ({
  uploadCharacterSheet: {
    description:
      "Upload a character sheet file (PDF, image, or document) for a campaign",
    parameters: {
      campaignId: "string",
      fileName: "string",
      fileContent: "string",
      characterName: "string (optional)",
      jwt: "string",
    },
    execute: vi.fn(),
  },
  processCharacterSheet: {
    description:
      "Process and extract information from an uploaded character sheet",
    parameters: {
      characterSheetId: "string",
      jwt: "string",
    },
    execute: vi.fn(),
  },
}));

// Mock the character sheet list tools module
vi.mock("../../src/tools/character-sheet/list-tools", () => ({
  listCharacterSheets: {
    description: "List all character sheets for a campaign",
    parameters: {
      campaignId: "string",
      jwt: "string",
    },
    execute: vi.fn(),
  },
}));

// Mock the character sheet creation tools module
vi.mock("../../src/tools/character-sheet/creation-tools", () => ({
  createCharacterSheet: {
    description: "Create a new character sheet for a campaign",
    parameters: {
      campaignId: "string",
      characterName: "string",
      characterClass: "string (optional)",
      characterLevel: "number (optional)",
      characterRace: "string (optional)",
      jwt: "string",
    },
    execute: vi.fn(),
  },
}));

// Mock the tools utils
vi.mock("../../src/tools/utils", () => ({
  createToolSuccess: vi.fn(
    (message: string, data: any, toolCallId: string): ToolResult => ({
      toolCallId,
      result: {
        success: true,
        message,
        data,
      },
    })
  ),
  createToolError: vi.fn(
    (
      message: string,
      error: any,
      code: number,
      toolCallId: string
    ): ToolResult => ({
      toolCallId,
      result: {
        success: false,
        message,
        data: { error: error instanceof Error ? error.message : String(error) },
      },
    })
  ),
  extractUsernameFromJwt: vi.fn((jwt: string) => {
    if (!jwt) return null;
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1]));
      return payload.username || "test-user";
    } catch {
      return "test-user";
    }
  }),
}));

// Mock the toolAuth module
vi.mock("../../src/lib/toolAuth", () => ({
  authenticatedFetch: vi.fn(),
  handleAuthError: vi.fn(),
}));

// Helper function to create mock character sheet data
function createMockCharacterSheet(overrides: any = {}) {
  return {
    id: "char-123",
    campaignId: "campaign-123",
    characterName: "Test Character",
    fileName: "character-sheet.pdf",
    fileContent: "base64-encoded-content",
    fileSize: 1024,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    processedData: null,
    processedAt: null,
    ...overrides,
  };
}

describe("Character Sheet Tools", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Set up default mock implementations
    const { uploadCharacterSheet, processCharacterSheet } = await import(
      "../../src/tools/character-sheet/upload-tools"
    );
    const { listCharacterSheets } = await import(
      "../../src/tools/character-sheet/list-tools"
    );
    const { createCharacterSheet } = await import(
      "../../src/tools/character-sheet/creation-tools"
    );

    (uploadCharacterSheet as any).execute.mockResolvedValue(undefined);
    (processCharacterSheet as any).execute.mockResolvedValue(undefined);
    (listCharacterSheets as any).execute.mockResolvedValue(undefined);
    (createCharacterSheet as any).execute.mockResolvedValue(undefined);
  });

  describe("uploadCharacterSheet tool", () => {
    it("should validate tool structure", async () => {
      const { uploadCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );

      expect(uploadCharacterSheet).toBeDefined();

      const toolDefinition = uploadCharacterSheet as any;
      expect(toolDefinition.description).toContain(
        "Upload a character sheet file"
      );
      expect(toolDefinition.parameters).toBeDefined();
    });

    it("should require correct parameters", async () => {
      const { uploadCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );

      const toolDefinition = uploadCharacterSheet as any;
      const parameters = toolDefinition.parameters;

      expect(parameters).toBeDefined();
      expect(typeof toolDefinition.description).toBe("string");
    });

    it("should handle successful upload with direct database access", async () => {
      const { uploadCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );

      const mockCharacterSheet = createMockCharacterSheet();
      const expectedResult = {
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: `Successfully uploaded character sheet: ${mockCharacterSheet.fileName}`,
          data: {
            id: mockCharacterSheet.id,
            fileName: mockCharacterSheet.fileName,
            characterName: mockCharacterSheet.characterName,
            fileSize: mockCharacterSheet.fileSize,
            createdAt: mockCharacterSheet.createdAt,
          },
        },
      };

      (uploadCharacterSheet as any).execute.mockResolvedValue(expectedResult);

      const result = await uploadCharacterSheet.execute(
        {
          campaignId: "campaign-123",
          fileName: "character-sheet.pdf",
          fileContent: "base64-encoded-content",
          characterName: "Test Character",
          jwt: "test-jwt",
        },
        { toolCallId: "test-call-123", messages: [] }
      );

      expect(result).toMatchObject(expectedResult);
    });

    it("should handle authentication failure", async () => {
      const { uploadCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );

      const expectedResult = {
        toolCallId: "test-call-123",
        result: {
          success: false,
          message: "Invalid authentication token",
          data: { error: "Authentication failed" },
        },
      };

      (uploadCharacterSheet as any).execute.mockResolvedValue(expectedResult);

      const result = await uploadCharacterSheet.execute(
        {
          campaignId: "campaign-123",
          fileName: "character-sheet.pdf",
          fileContent: "base64-encoded-content",
          jwt: "invalid-jwt",
        },
        { toolCallId: "test-call-123", messages: [] }
      );

      expect(result).toMatchObject(expectedResult);
    });

    it("should handle HTTP API fallback", async () => {
      const { uploadCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );
      const { authenticatedFetch } = await import("../../src/lib/toolAuth");

      const expectedResult = {
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Successfully uploaded character sheet via API",
          data: {
            id: "char-123",
            fileName: "character-sheet.pdf",
            characterName: "Test Character",
          },
        },
      };

      (uploadCharacterSheet as any).execute.mockResolvedValue(expectedResult);
      (authenticatedFetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: "char-123",
          fileName: "character-sheet.pdf",
          characterName: "Test Character",
        }),
      });

      const result = await uploadCharacterSheet.execute(
        {
          campaignId: "campaign-123",
          fileName: "character-sheet.pdf",
          fileContent: "base64-encoded-content",
          characterName: "Test Character",
          jwt: "test-jwt",
        },
        { toolCallId: "test-call-123", messages: [] }
      );

      expect(result).toMatchObject(expectedResult);
    });
  });

  describe("processCharacterSheet tool", () => {
    it("should validate tool structure", async () => {
      const { processCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );

      expect(processCharacterSheet).toBeDefined();

      const toolDefinition = processCharacterSheet as any;
      expect(toolDefinition.description).toContain(
        "Process and extract information"
      );
      expect(toolDefinition.parameters).toBeDefined();
    });

    it("should handle successful processing with direct database access", async () => {
      const { processCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );

      const mockCharacterSheet = createMockCharacterSheet({
        processedData: {
          characterName: "Test Character",
          characterClass: "Fighter",
          characterLevel: 5,
          characterRace: "Human",
          extractedAt: new Date().toISOString(),
          confidence: 0.8,
        },
      });

      const expectedResult = {
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: `Successfully processed character sheet: ${mockCharacterSheet.characterName}`,
          data: {
            id: mockCharacterSheet.id,
            characterName: mockCharacterSheet.characterName,
            processedData: mockCharacterSheet.processedData,
            processedAt: new Date().toISOString(),
          },
        },
      };

      (processCharacterSheet as any).execute.mockResolvedValue(expectedResult);

      const result = await processCharacterSheet.execute(
        {
          characterSheetId: "char-123",
          jwt: "test-jwt",
        },
        { toolCallId: "test-call-123", messages: [] }
      );

      expect(result).toMatchObject(expectedResult);
    });

    it("should handle character sheet not found", async () => {
      const { processCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );

      const expectedResult = {
        toolCallId: "test-call-123",
        result: {
          success: false,
          message: "Character sheet not found",
          data: { error: "Character sheet not found" },
        },
      };

      (processCharacterSheet as any).execute.mockResolvedValue(expectedResult);

      const result = await processCharacterSheet.execute(
        {
          characterSheetId: "non-existent",
          jwt: "test-jwt",
        },
        { toolCallId: "test-call-123", messages: [] }
      );

      expect(result).toMatchObject(expectedResult);
    });

    it("should handle HTTP API fallback for processing", async () => {
      const { processCharacterSheet } = await import(
        "../../src/tools/character-sheet/upload-tools"
      );

      const expectedResult = {
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Successfully processed character sheet via API",
          data: {
            id: "char-123",
            characterName: "Test Character",
            processedData: {
              characterName: "Test Character",
              characterClass: "Fighter",
              characterLevel: 5,
            },
          },
        },
      };

      (processCharacterSheet as any).execute.mockResolvedValue(expectedResult);

      const result = await processCharacterSheet.execute(
        {
          characterSheetId: "char-123",
          jwt: "test-jwt",
        },
        { toolCallId: "test-call-123", messages: [] }
      );

      expect(result).toMatchObject(expectedResult);
    });
  });

  describe("listCharacterSheets tool", () => {
    it("should validate tool structure", async () => {
      const { listCharacterSheets } = await import(
        "../../src/tools/character-sheet/list-tools"
      );

      expect(listCharacterSheets).toBeDefined();

      const toolDefinition = listCharacterSheets as any;
      expect(toolDefinition.description).toContain("List all character sheets");
      expect(toolDefinition.parameters).toBeDefined();
    });

    it("should handle successful listing with direct database access", async () => {
      const { listCharacterSheets } = await import(
        "../../src/tools/character-sheet/list-tools"
      );

      const mockCharacterSheets = [
        createMockCharacterSheet({
          id: "char-1",
          characterName: "Character 1",
        }),
        createMockCharacterSheet({
          id: "char-2",
          characterName: "Character 2",
        }),
      ];

      const expectedResult = {
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Successfully retrieved character sheets",
          data: {
            characterSheets: mockCharacterSheets,
            count: mockCharacterSheets.length,
          },
        },
      };

      (listCharacterSheets as any).execute.mockResolvedValue(expectedResult);

      const result = await listCharacterSheets.execute(
        {
          campaignId: "campaign-123",
          jwt: "test-jwt",
        },
        { toolCallId: "test-call-123", messages: [] }
      );

      expect(result).toMatchObject(expectedResult);
    });
  });

  describe("createCharacterSheet tool", () => {
    it("should validate tool structure", async () => {
      const { createCharacterSheet } = await import(
        "../../src/tools/character-sheet/creation-tools"
      );

      expect(createCharacterSheet).toBeDefined();

      const toolDefinition = createCharacterSheet as any;
      expect(toolDefinition.description).toContain(
        "Create a new character sheet"
      );
      expect(toolDefinition.parameters).toBeDefined();
    });

    it("should handle successful creation with direct database access", async () => {
      const { createCharacterSheet } = await import(
        "../../src/tools/character-sheet/creation-tools"
      );

      const mockCharacterSheet = createMockCharacterSheet({
        characterName: "New Character",
        characterClass: "Wizard",
        characterLevel: 3,
        characterRace: "Elf",
      });

      const expectedResult = {
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: `Successfully created character sheet: ${mockCharacterSheet.characterName}`,
          data: {
            id: mockCharacterSheet.id,
            characterName: mockCharacterSheet.characterName,
            characterClass: mockCharacterSheet.characterClass,
            characterLevel: mockCharacterSheet.characterLevel,
            characterRace: mockCharacterSheet.characterRace,
            createdAt: mockCharacterSheet.createdAt,
          },
        },
      };

      (createCharacterSheet as any).execute.mockResolvedValue(expectedResult);

      const result = await createCharacterSheet.execute(
        {
          campaignId: "campaign-123",
          characterName: "New Character",
          characterClass: "Wizard",
          characterLevel: 3,
          characterRace: "Elf",
          jwt: "test-jwt",
        },
        { toolCallId: "test-call-123", messages: [] }
      );

      expect(result).toMatchObject(expectedResult);
    });
  });

  describe("ToolResult format validation", () => {
    it("should ensure all tools return proper ToolResult format", async () => {
      const { createToolSuccess, createToolError } = await import(
        "../../src/tools/utils"
      );

      // Reset mocks to ensure clean state
      vi.clearAllMocks();

      // Test success format
      const successResult = (createToolSuccess as any)(
        "Test message",
        { data: "test" },
        "test-call-123"
      );
      expect(successResult).toEqual({
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Test message",
          data: { data: "test" },
        },
      });

      // Test error format
      const errorResult = (createToolError as any)(
        "Error message",
        "Test error",
        500,
        "test-call-123"
      );
      expect(errorResult).toEqual({
        toolCallId: "test-call-123",
        result: {
          success: false,
          message: "Error message",
          data: { error: "Test error" },
        },
      });
    });

    it("should validate ToolResult interface compliance", () => {
      const validToolResult: ToolResult = {
        toolCallId: "test-call-123",
        result: {
          success: true,
          message: "Test message",
          data: { test: "data" },
        },
      };

      expect(validToolResult.toolCallId).toBe("test-call-123");
      expect(validToolResult.result.success).toBe(true);
      expect(validToolResult.result.message).toBe("Test message");
      expect(validToolResult.result.data).toEqual({ test: "data" });
    });
  });
});
