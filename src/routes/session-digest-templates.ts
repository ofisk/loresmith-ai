import { generateId } from "ai";
import { getDAOFactory } from "@/dao/dao-factory";
import { CampaignAccessDeniedError } from "@/lib/errors";
import {
	type ContextWithAuth,
	ensureCampaignAccess,
	getUserAuth,
	requireCanSeeSpoilers,
	requireParam,
} from "@/lib/route-utils";
import type {
	CreateSessionDigestTemplateInput,
	SessionDigestData,
	UpdateSessionDigestTemplateInput,
} from "@/types/session-digest";
import { validateSessionDigestData } from "@/types/session-digest";

// Create a new session digest template
export async function handleCreateSessionDigestTemplate(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const body = (await c.req.json()) as {
			name: string;
			description?: string | null;
			templateData: SessionDigestData;
		};

		if (!body.name || typeof body.name !== "string") {
			return c.json({ error: "name is required and must be a string" }, 400);
		}

		if (!body.templateData || !validateSessionDigestData(body.templateData)) {
			return c.json({ error: "Invalid templateData structure" }, 400);
		}

		const daoFactory = getDAOFactory(c.env);
		const templateId = generateId();
		const input: CreateSessionDigestTemplateInput = {
			campaignId,
			name: body.name,
			description: body.description || null,
			templateData: body.templateData,
		};

		await daoFactory.sessionDigestTemplateDAO.createTemplate(templateId, input);

		const created =
			await daoFactory.sessionDigestTemplateDAO.getTemplateById(templateId);
		if (!created) {
			return c.json({ error: "Failed to retrieve created template" }, 500);
		}

		return c.json({ template: created }, 201);
	} catch (error) {
		if (error instanceof CampaignAccessDeniedError) {
			return c.json({ error: "Access denied" }, 403);
		}
		return c.json(
			{ error: "Failed to create session digest template" },
			error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
		);
	}
}

// Get a specific template
export async function handleGetSessionDigestTemplate(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const templateId = requireParam(c, "templateId");
		if (templateId instanceof Response) return templateId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const template =
			await daoFactory.sessionDigestTemplateDAO.getTemplateById(templateId);

		if (!template) {
			return c.json({ error: "Template not found" }, 404);
		}

		if (template.campaignId !== campaignId) {
			return c.json(
				{ error: "Template does not belong to this campaign" },
				404
			);
		}

		return c.json({ template });
	} catch (error) {
		if (error instanceof CampaignAccessDeniedError) {
			return c.json({ error: "Access denied" }, 403);
		}
		return c.json({ error: "Failed to get template" }, 500);
	}
}

// Get all templates for a campaign
export async function handleGetSessionDigestTemplates(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const templates =
			await daoFactory.sessionDigestTemplateDAO.getTemplatesByCampaign(
				campaignId
			);

		return c.json({ templates });
	} catch (error) {
		if (error instanceof CampaignAccessDeniedError) {
			return c.json({ error: "Access denied" }, 403);
		}
		return c.json({ error: "Failed to list templates" }, 500);
	}
}

// Update a template
export async function handleUpdateSessionDigestTemplate(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const templateId = requireParam(c, "templateId");
		if (templateId instanceof Response) return templateId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const daoFactory = getDAOFactory(c.env);
		const existing =
			await daoFactory.sessionDigestTemplateDAO.getTemplateById(templateId);

		if (!existing) {
			return c.json({ error: "Template not found" }, 404);
		}

		if (existing.campaignId !== campaignId) {
			return c.json(
				{ error: "Template does not belong to this campaign" },
				404
			);
		}

		const body = (await c.req.json()) as {
			name?: string;
			description?: string | null;
			templateData?: SessionDigestData;
		};

		const input: UpdateSessionDigestTemplateInput = {};

		if (body.name !== undefined) {
			input.name = body.name;
		}

		if (body.description !== undefined) {
			input.description = body.description;
		}

		if (body.templateData !== undefined) {
			if (!validateSessionDigestData(body.templateData)) {
				return c.json({ error: "Invalid templateData structure" }, 400);
			}
			input.templateData = body.templateData;
		}

		if (Object.keys(input).length === 0) {
			return c.json({ error: "No fields to update" }, 400);
		}

		await daoFactory.sessionDigestTemplateDAO.updateTemplate(templateId, input);

		const updated =
			await daoFactory.sessionDigestTemplateDAO.getTemplateById(templateId);
		if (!updated) {
			return c.json({ error: "Failed to retrieve updated template" }, 500);
		}

		return c.json({ template: updated });
	} catch (error) {
		if (error instanceof CampaignAccessDeniedError) {
			return c.json({ error: "Access denied" }, 403);
		}
		return c.json(
			{ error: "Failed to update template" },
			error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
		);
	}
}

// Delete a template
export async function handleDeleteSessionDigestTemplate(c: ContextWithAuth) {
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const templateId = requireParam(c, "templateId");
		if (templateId instanceof Response) return templateId;

		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}
		await requireCanSeeSpoilers(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const existing =
			await daoFactory.sessionDigestTemplateDAO.getTemplateById(templateId);

		if (!existing) {
			return c.json({ error: "Template not found" }, 404);
		}

		if (existing.campaignId !== campaignId) {
			return c.json(
				{ error: "Template does not belong to this campaign" },
				404
			);
		}

		await daoFactory.sessionDigestTemplateDAO.deleteTemplate(templateId);

		return c.json({ success: true });
	} catch (error) {
		if (error instanceof CampaignAccessDeniedError) {
			return c.json({ error: "Access denied" }, 403);
		}
		return c.json({ error: "Failed to delete template" }, 500);
	}
}
