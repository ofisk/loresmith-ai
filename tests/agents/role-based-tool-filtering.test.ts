import { describe, expect, it } from "vitest";
import { playerCampaignTools } from "../../src/tools/campaign";
import { playerCharacterTools } from "../../src/tools/campaign-context/character-tools-bundle";
import {
	campaignContextToolsBundle,
	playerCampaignContextToolsBundle,
} from "../../src/tools/campaign-context/context-tools-bundle";
import {
	gmLootRewardToolsBundle,
	playerLootRewardToolsBundle,
} from "../../src/tools/campaign-context/loot-reward-tools-bundle";
import {
	gmRecapToolsBundle,
	playerRecapToolsBundle,
} from "../../src/tools/campaign-context/recap-agent-tools-bundle";
import {
	gmRulesReferenceToolsBundle,
	playerRulesReferenceToolsBundle,
} from "../../src/tools/campaign-context/rules-reference-tools-bundle";
import { playerCharacterSheetTools } from "../../src/tools/character-sheet";

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
		it("campaignContextToolsBundle should include entity CRUD, world state, and timeline tools", () => {
			expect(campaignContextToolsBundle.recordWorldEventTool).toBeDefined();
			expect(campaignContextToolsBundle.updateEntityMetadataTool).toBeDefined();
			expect(
				campaignContextToolsBundle.captureConversationalContext
			).toBeDefined();
			expect(campaignContextToolsBundle.buildTimelineTool).toBeDefined();
			expect(campaignContextToolsBundle.addTimelineEventTool).toBeDefined();
			expect(campaignContextToolsBundle.queryTimelineRangeTool).toBeDefined();
			expect(campaignContextToolsBundle.defineHouseRuleTool).toBeDefined();
			expect(campaignContextToolsBundle.updateHouseRuleTool).toBeDefined();
			expect(
				campaignContextToolsBundle.checkHouseRuleConflictTool
			).toBeDefined();
			expect(campaignContextToolsBundle.generateHandoutTool).toBeDefined();
			expect(campaignContextToolsBundle.exportHandoutTool).toBeDefined();
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
			expect(playerCampaignContextToolsBundle.listHouseRulesTool).toBeDefined();
			expect(
				(playerCampaignContextToolsBundle as any).recordWorldEventTool
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).buildTimelineTool
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).addTimelineEventTool
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).queryTimelineRangeTool
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).defineHouseRuleTool
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).updateHouseRuleTool
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).checkHouseRuleConflictTool
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).captureConversationalContext
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).getDocumentContent
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).generateHandoutTool
			).toBeUndefined();
			expect(
				(playerCampaignContextToolsBundle as any).exportHandoutTool
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
			expect(playerCampaignTools.listHouseRulesTool).toBeDefined();
			expect((playerCampaignTools as any).planSession).toBeUndefined();
			expect(
				(playerCampaignTools as any).checkPlanningReadiness
			).toBeUndefined();
			expect((playerCampaignTools as any).recordWorldEventTool).toBeUndefined();
			expect((playerCampaignTools as any).defineHouseRuleTool).toBeUndefined();
			expect((playerCampaignTools as any).updateHouseRuleTool).toBeUndefined();
			expect(
				(playerCampaignTools as any).checkHouseRuleConflictTool
			).toBeUndefined();
			expect((playerCampaignTools as any).updateCampaign).toBeUndefined();
			expect((playerCampaignTools as any).deleteCampaign).toBeUndefined();
		});
	});

	describe("Loot reward tools bundles", () => {
		it("gmLootRewardToolsBundle should include loot generation and tracking tools", () => {
			expect(gmLootRewardToolsBundle.generateLootTool).toBeDefined();
			expect(gmLootRewardToolsBundle.suggestMagicItemTool).toBeDefined();
			expect(gmLootRewardToolsBundle.trackDistributedLootTool).toBeDefined();
		});

		it("playerLootRewardToolsBundle should exclude GM-only loot tools", () => {
			expect(
				(playerLootRewardToolsBundle as any).generateLootTool
			).toBeUndefined();
			expect(
				(playerLootRewardToolsBundle as any).suggestMagicItemTool
			).toBeUndefined();
			expect(
				(playerLootRewardToolsBundle as any).trackDistributedLootTool
			).toBeUndefined();
		});
	});

	describe("Rules reference tools bundles", () => {
		it("gmRulesReferenceToolsBundle should include rules search and conflict tools", () => {
			expect(gmRulesReferenceToolsBundle.searchRulesTool).toBeDefined();
			expect(gmRulesReferenceToolsBundle.lookupStatBlockTool).toBeDefined();
			expect(
				gmRulesReferenceToolsBundle.resolveRulesConflictTool
			).toBeDefined();
		});

		it("playerRulesReferenceToolsBundle should include read-only rules tools", () => {
			expect(playerRulesReferenceToolsBundle.searchRulesTool).toBeDefined();
			expect(playerRulesReferenceToolsBundle.lookupStatBlockTool).toBeDefined();
			expect(
				playerRulesReferenceToolsBundle.resolveRulesConflictTool
			).toBeDefined();
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
