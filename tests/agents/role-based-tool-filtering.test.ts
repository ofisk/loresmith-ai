import { describe, expect, it, vi } from "vitest";
import { CAMPAIGN_ROLES } from "../../src/constants/campaign-roles";
import {
  gmRecapToolsBundle,
  playerRecapToolsBundle,
} from "../../src/tools/campaign-context/recap-agent-tools-bundle";
import {
  campaignContextToolsBundle,
  playerCampaignContextToolsBundle,
} from "../../src/tools/campaign-context/context-tools-bundle";
import {
  characterManagementTools,
  playerCharacterTools,
} from "../../src/tools/campaign-context/character-tools-bundle";
import { campaignTools, playerCampaignTools } from "../../src/tools/campaign";
import {
  characterSheetTools,
  playerCharacterSheetTools,
} from "../../src/tools/character-sheet";

describe("Role-based tool filtering", () => {
  describe("Recap tools bundles", () => {
    it("gmRecapToolsBundle should include GM-only tools", () => {
      expect(gmRecapToolsBundle.generateGMContextRecapTool).toBeDefined();
      expect(gmRecapToolsBundle.getPlanningTaskProgress).toBeDefined();
      expect(gmRecapToolsBundle.recordPlanningTasks).toBeDefined();
      expect(gmRecapToolsBundle.getSessionReadoutContext).toBeDefined();
    });

    it("playerRecapToolsBundle should exclude GM-only tools", () => {
      expect(
        playerRecapToolsBundle.generatePlayerContextRecapTool
      ).toBeDefined();
      expect(playerRecapToolsBundle.showCampaignDetails).toBeDefined();
      expect(playerRecapToolsBundle.searchCampaignContext).toBeDefined();
      expect(
        (playerRecapToolsBundle as any).getPlanningTaskProgress
      ).toBeUndefined();
      expect(
        (playerRecapToolsBundle as any).recordPlanningTasks
      ).toBeUndefined();
      expect(
        (playerRecapToolsBundle as any).getSessionReadoutContext
      ).toBeUndefined();
    });
  });

  describe("Campaign context tools bundles", () => {
    it("campaignContextToolsBundle should include entity CRUD and world state tools", () => {
      expect(campaignContextToolsBundle.recordWorldEventTool).toBeDefined();
      expect(campaignContextToolsBundle.updateEntityMetadataTool).toBeDefined();
      expect(
        campaignContextToolsBundle.captureConversationalContext
      ).toBeDefined();
    });

    it("playerCampaignContextToolsBundle should exclude GM-only tools", () => {
      expect(
        playerCampaignContextToolsBundle.searchCampaignContext
      ).toBeDefined();
      expect(playerCampaignContextToolsBundle.listAllEntities).toBeDefined();
      expect(
        playerCampaignContextToolsBundle.showCampaignDetails
      ).toBeDefined();
      expect(playerCampaignContextToolsBundle.getMessageHistory).toBeDefined();
      expect(
        (playerCampaignContextToolsBundle as any).recordWorldEventTool
      ).toBeUndefined();
      expect(
        (playerCampaignContextToolsBundle as any).captureConversationalContext
      ).toBeUndefined();
      expect(
        (playerCampaignContextToolsBundle as any).getDocumentContent
      ).toBeUndefined();
    });
  });

  describe("Character tools bundles", () => {
    it("playerCharacterTools should exclude deleteEntityTool and getDocumentContent", () => {
      expect(playerCharacterTools.storeCharacterInfo).toBeDefined();
      expect(playerCharacterTools.generateCharacterWithAITool).toBeDefined();
      expect(playerCharacterTools.searchCampaignContext).toBeDefined();
      expect(playerCharacterTools.listAllEntities).toBeDefined();
      expect((playerCharacterTools as any).deleteEntityTool).toBeUndefined();
      expect((playerCharacterTools as any).getDocumentContent).toBeUndefined();
    });
  });

  describe("Campaign tools bundles", () => {
    it("playerCampaignTools should exclude GM-only tools", () => {
      expect(playerCampaignTools.listCampaigns).toBeDefined();
      expect(playerCampaignTools.createCampaign).toBeDefined();
      expect(playerCampaignTools.showCampaignDetails).toBeDefined();
      expect(playerCampaignTools.proposeResourceToCampaign).toBeDefined();
      expect((playerCampaignTools as any).planSession).toBeUndefined();
      expect(
        (playerCampaignTools as any).checkPlanningReadiness
      ).toBeUndefined();
      expect((playerCampaignTools as any).recordWorldEventTool).toBeUndefined();
      expect((playerCampaignTools as any).updateCampaign).toBeUndefined();
      expect((playerCampaignTools as any).deleteCampaign).toBeUndefined();
    });
  });

  describe("Character sheet tools bundles", () => {
    it("playerCharacterSheetTools should exclude getDocumentContent", () => {
      expect(playerCharacterSheetTools.uploadCharacterSheet).toBeDefined();
      expect(playerCharacterSheetTools.processCharacterSheet).toBeDefined();
      expect(playerCharacterSheetTools.createCharacterSheet).toBeDefined();
      expect(playerCharacterSheetTools.listCharacterSheets).toBeDefined();
      expect(
        (playerCharacterSheetTools as any).getDocumentContent
      ).toBeUndefined();
    });
  });
});
