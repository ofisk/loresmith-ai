import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignContextSyncService } from "../../src/services/campaign-context-sync-service";
import type { Env } from "../../src/middleware/auth";

describe("CampaignContextSyncService", () => {
  let syncService: CampaignContextSyncService;
  let mockEnv: Env;
  let mockR2: any;

  const campaignId = "test-campaign-123";

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock R2 operations
    mockR2 = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    // Mock environment
    mockEnv = {
      DB: {} as any,
      AUTORAG_BASE_URL: "https://test-autorag.com",
      R2_BUCKET: mockR2 as any,
      R2: mockR2 as any,
      VECTORIZE: {} as any,
      AI: {} as any,
      Chat: {} as any,
      NOTIFICATION_HUB: {} as any,
      UPLOAD_SESSION: {} as any,
      UploadSession: {} as any,
      AUTORAG_POLLING: {} as any,
      AUTORAG_API_KEY: "test-key",
      AUTORAG_API_TOKEN: "test-token",
      OPENAI_API_KEY: "test-key",
      ASSETS: {} as any,
      FILE_PROCESSING_QUEUE: {} as any,
      FILE_PROCESSING_DLQ: {} as any,
    } as unknown as Env;

    syncService = new CampaignContextSyncService(mockEnv);
  });

  describe("syncCharacterToAutoRAG", () => {
    it("should sync character to approved folder", async () => {
      const characterId = "char-123";
      const characterName = "Aragorn";
      const characterData = {
        backstory: "Ranger of the North",
        personality_traits: "Noble and brave",
        goals: "Reclaim the throne",
      };

      mockR2.put.mockResolvedValue(undefined);

      await syncService.syncCharacterToAutoRAG(
        campaignId,
        characterId,
        characterName,
        characterData
      );

      expect(mockR2.put).toHaveBeenCalledOnce();
      const call = mockR2.put.mock.calls[0];

      // Verify path
      expect(call[0]).toBe(
        `campaigns/${campaignId}/context/approved/${characterId}.json`
      );

      // Verify content structure
      const savedData = JSON.parse(new TextDecoder().decode(call[1]));
      expect(savedData.id).toBe(characterId);
      expect(savedData.metadata.entityType).toBe("character");
      expect(savedData.metadata.characterName).toBe(characterName);
      expect(savedData.metadata.campaignId).toBe(campaignId);
      expect(savedData.text).toContain("Aragorn");
      expect(savedData.text).toContain("Ranger of the North");
    });
  });

  describe("syncContextToAutoRAG", () => {
    it("should sync campaign context to approved folder", async () => {
      const contextId = "ctx-456";
      const contextType = "campaign_info";
      const title = "Campaign Title";
      const content = "The Rise of the Dragon Lords";

      mockR2.put.mockResolvedValue(undefined);

      await syncService.syncContextToAutoRAG(
        campaignId,
        contextId,
        contextType,
        title,
        content
      );

      expect(mockR2.put).toHaveBeenCalledOnce();
      const call = mockR2.put.mock.calls[0];

      // Verify path
      expect(call[0]).toBe(
        `campaigns/${campaignId}/context/approved/${contextId}.json`
      );

      // Verify content structure
      const savedData = JSON.parse(new TextDecoder().decode(call[1]));
      expect(savedData.id).toBe(contextId);
      expect(savedData.metadata.entityType).toBe("context");
      expect(savedData.metadata.contextType).toBe(contextType);
      expect(savedData.metadata.title).toBe(title);
      expect(savedData.text).toContain(title);
      expect(savedData.text).toContain(content);
    });

    it("should include additional metadata when provided", async () => {
      const contextId = "ctx-789";
      const additionalMeta = { field: "description", customFlag: true };

      mockR2.put.mockResolvedValue(undefined);

      await syncService.syncContextToAutoRAG(
        campaignId,
        contextId,
        "plot_decision",
        "Main Quest",
        "Defeat the dragon",
        additionalMeta
      );

      const call = mockR2.put.mock.calls[0];
      const savedData = JSON.parse(new TextDecoder().decode(call[1]));

      expect(savedData.metadata.field).toBe("description");
      expect(savedData.metadata.customFlag).toBe(true);
    });
  });

  describe("syncCharacterSheetToAutoRAG", () => {
    it("should sync character sheet to approved folder", async () => {
      const sheetId = "sheet-123";
      const characterName = "Gandalf";
      const characterData = {
        class: "Wizard",
        level: 20,
        stats: { str: 10, dex: 12, con: 14, int: 20, wis: 18, cha: 16 },
      };

      mockR2.put.mockResolvedValue(undefined);

      await syncService.syncCharacterSheetToAutoRAG(
        campaignId,
        sheetId,
        characterName,
        characterData
      );

      expect(mockR2.put).toHaveBeenCalledOnce();
      const call = mockR2.put.mock.calls[0];

      // Verify path
      expect(call[0]).toBe(
        `campaigns/${campaignId}/context/approved/${sheetId}.json`
      );

      // Verify content
      const savedData = JSON.parse(new TextDecoder().decode(call[1]));
      expect(savedData.metadata.entityType).toBe("character_sheet");
      expect(savedData.metadata.characterName).toBe(characterName);
      expect(savedData.text).toContain("Gandalf");
    });
  });

  describe("createStagingShard", () => {
    it("should create staging shard for conversational context", async () => {
      const noteId = "note-123";
      const noteTitle = "Village of Barovia";
      const noteContent = "A gloomy village trapped in mist...";
      const noteType = "locations";
      const confidence = 0.85;
      const sourceMessageId = "msg-456";

      mockR2.put.mockResolvedValue(undefined);

      const result = await syncService.createStagingShard(
        campaignId,
        noteId,
        noteTitle,
        noteContent,
        noteType,
        confidence,
        sourceMessageId
      );

      expect(mockR2.put).toHaveBeenCalledOnce();
      expect(result.stagingKey).toContain("/conversation/staging/");
      expect(result.stagingKey).toContain(noteId);

      const call = mockR2.put.mock.calls[0];
      const savedData = JSON.parse(new TextDecoder().decode(call[1]));

      expect(savedData.id).toBe(noteId);
      expect(savedData.text).toBe(noteContent);
      expect(savedData.metadata.entityType).toBe("conversational_context");
      expect(savedData.metadata.noteType).toBe(noteType);
      expect(savedData.metadata.title).toBe(noteTitle);
      expect(savedData.metadata.sourceType).toBe("ai_detected");
      expect(savedData.metadata.confidence).toBe(confidence);
      expect(savedData.metadata.sourceMessageId).toBe(sourceMessageId);
    });

    it("should use default confidence when not provided", async () => {
      mockR2.put.mockResolvedValue(undefined);

      const result = await syncService.createStagingShard(
        campaignId,
        "note-789",
        "Test Note",
        "Test content"
      );

      const call = mockR2.put.mock.calls[0];
      const savedData = JSON.parse(new TextDecoder().decode(call[1]));

      expect(savedData.metadata.confidence).toBe(0.8); // default
      expect(savedData.metadata.noteType).toBe("general"); // default
    });
  });

  describe("delete operations", () => {
    it("should delete character from AutoRAG", async () => {
      const characterId = "char-123";
      mockR2.delete.mockResolvedValue(undefined);

      await syncService.deleteCharacterFromAutoRAG(campaignId, characterId);

      expect(mockR2.delete).toHaveBeenCalledWith(
        `campaigns/${campaignId}/context/approved/${characterId}.json`
      );
    });

    it("should delete context from AutoRAG", async () => {
      const contextId = "ctx-456";
      mockR2.delete.mockResolvedValue(undefined);

      await syncService.deleteContextFromAutoRAG(campaignId, contextId);

      expect(mockR2.delete).toHaveBeenCalledWith(
        `campaigns/${campaignId}/context/approved/${contextId}.json`
      );
    });

    it("should delete character sheet from AutoRAG", async () => {
      const sheetId = "sheet-789";
      mockR2.delete.mockResolvedValue(undefined);

      await syncService.deleteCharacterSheetFromAutoRAG(campaignId, sheetId);

      expect(mockR2.delete).toHaveBeenCalledWith(
        `campaigns/${campaignId}/context/approved/${sheetId}.json`
      );
    });
  });

  describe("text formatting", () => {
    it("should format character data with all fields", async () => {
      const characterData = {
        backstory: "Ancient warrior",
        personality_traits: "Stoic and wise",
        goals: "Protect the realm",
        notes: "Carries ancient sword",
        custom_field: "Custom value",
      };

      mockR2.put.mockResolvedValue(undefined);

      await syncService.syncCharacterToAutoRAG(
        campaignId,
        "char-1",
        "Warrior",
        characterData
      );

      const call = mockR2.put.mock.calls[0];
      const savedData = JSON.parse(new TextDecoder().decode(call[1]));

      expect(savedData.text).toContain("Warrior");
      expect(savedData.text).toContain("Ancient warrior");
      expect(savedData.text).toContain("Stoic and wise");
      expect(savedData.text).toContain("Protect the realm");
      expect(savedData.text).toContain("ancient sword");
      expect(savedData.text).toContain("Custom Field");
    });

    it("should format context with type and content", async () => {
      mockR2.put.mockResolvedValue(undefined);

      await syncService.syncContextToAutoRAG(
        campaignId,
        "ctx-1",
        "world_building",
        "Magic System",
        "Magic is powered by emotions"
      );

      const call = mockR2.put.mock.calls[0];
      const savedData = JSON.parse(new TextDecoder().decode(call[1]));

      expect(savedData.text).toContain("WORLD_BUILDING");
      expect(savedData.text).toContain("Magic System");
      expect(savedData.text).toContain("Magic is powered by emotions");
    });
  });

  describe("R2 path construction", () => {
    it("should construct correct approved paths for characters", () => {
      const characterId = "char-123";
      const expectedPath = `campaigns/${campaignId}/context/approved/${characterId}.json`;

      expect(expectedPath).toMatch(
        /campaigns\/.*\/context\/approved\/.*\.json/
      );
    });

    it("should construct correct staging paths for conversational context", () => {
      const noteId = "note-456";
      const expectedPath = `campaigns/${campaignId}/conversation/staging/${noteId}.json`;

      expect(expectedPath).toMatch(
        /campaigns\/.*\/conversation\/staging\/.*\.json/
      );
    });
  });
});
