import { useCallback, useState } from "react";
import { PrimaryActionButton } from "@/components/button";
import { Modal } from "@/components/modal/Modal";
import { CAMPAIGN_ROLES, SHARE_ROLE_OPTIONS } from "@/constants/campaign-roles";
import { STANDARD_MODAL_SIZE_OBJECT } from "@/constants/modal-sizes";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { API_CONFIG } from "@/shared-config";
import type { Campaign } from "@/types/campaign";

interface ShareCampaignModalProps {
  campaign: Campaign | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareCampaignModal({
  campaign,
  isOpen,
  onClose,
}: ShareCampaignModalProps) {
  const [role, setRole] = useState<
    (typeof SHARE_ROLE_OPTIONS)[number]["value"]
  >(CAMPAIGN_ROLES.READONLY_PLAYER);
  const [expiresAt, setExpiresAt] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [links, setLinks] = useState<
    Array<{
      token: string;
      role: string;
      expiresAt: string | null;
      maxUses: number | null;
      useCount: number;
      createdAt: string;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [listing, setListing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { makeRequest } = useAuthenticatedRequest();

  const fetchLinks = useCallback(async () => {
    if (!campaign?.campaignId) return;
    setListing(true);
    setError(null);
    try {
      const res = await makeRequest(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS(campaign.campaignId)
        )
      );
      const data = (await res.json()) as {
        links?: Array<{
          token: string;
          role: string;
          expiresAt: string | null;
          maxUses: number | null;
          useCount: number;
          createdAt: string;
        }>;
      };
      if (res.ok && data.links) {
        setLinks(data.links);
      }
    } catch {
      setError("Failed to load share links");
    } finally {
      setListing(false);
    }
  }, [campaign?.campaignId, makeRequest]);

  const handleGenerate = async () => {
    if (!campaign?.campaignId) return;
    setLoading(true);
    setError(null);
    setGeneratedUrl(null);
    try {
      const res = await makeRequest(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS(campaign.campaignId)
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            expiresAt: expiresAt || null,
            maxUses: maxUses ? parseInt(maxUses, 10) : null,
          }),
        }
      );
      const data = (await res.json()) as {
        token?: string;
        url?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        setGeneratedUrl(data.url);
        fetchLinks();
      } else {
        setError(data.error ?? "Failed to create share link");
      }
    } catch {
      setError("Failed to create share link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const handleRevoke = async (token: string) => {
    if (!campaign?.campaignId) return;
    try {
      const url = API_CONFIG.buildUrl(
        API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS_REVOKE(
          campaign.campaignId,
          token
        )
      );
      const res = await makeRequest(url, { method: "DELETE" });
      if (res.ok) {
        fetchLinks();
        if (generatedUrl?.includes(token)) {
          setGeneratedUrl(null);
        }
      }
    } catch {
      setError("Failed to revoke link");
    }
  };

  const loadLinks = useCallback(() => {
    if (isOpen && campaign?.campaignId) {
      fetchLinks();
    }
  }, [isOpen, campaign?.campaignId, fetchLinks]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      cardStyle={STANDARD_MODAL_SIZE_OBJECT}
      showCloseButton={true}
    >
      <div className="p-6 space-y-4">
        <h2 className="text-lg font-semibold text-neutral-100 mb-4">
          Share campaign
        </h2>
        {error && (
          <div className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="share-role"
            className="block text-sm font-medium text-neutral-300 mb-1"
          >
            Role for new link
          </label>
          <select
            id="share-role"
            value={role}
            onChange={(e) =>
              setRole(
                e.target.value as (typeof SHARE_ROLE_OPTIONS)[number]["value"]
              )
            }
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-neutral-100"
          >
            {SHARE_ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="share-expires"
            className="block text-sm font-medium text-neutral-300 mb-1"
          >
            Expires at (optional)
          </label>
          <input
            id="share-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-neutral-100"
          />
        </div>

        <div>
          <label
            htmlFor="share-max-uses"
            className="block text-sm font-medium text-neutral-300 mb-1"
          >
            Max uses (optional)
          </label>
          <input
            id="share-max-uses"
            type="number"
            min="1"
            placeholder="Unlimited"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 text-neutral-100"
          />
        </div>

        <PrimaryActionButton onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating…" : "Generate link"}
        </PrimaryActionButton>

        {generatedUrl && (
          <div className="flex items-center gap-2 rounded border border-neutral-600 bg-neutral-800/50 p-3">
            <input
              readOnly
              value={generatedUrl}
              className="flex-1 truncate rounded bg-transparent text-sm text-neutral-300"
            />
            <PrimaryActionButton onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </PrimaryActionButton>
          </div>
        )}

        <div className="border-t border-neutral-700 pt-4">
          <h3 className="mb-2 text-sm font-medium text-neutral-300">
            Active links
          </h3>
          {listing ? (
            <div className="text-sm text-neutral-500">Loading…</div>
          ) : links.length === 0 ? (
            <div className="text-sm text-neutral-500">No active links</div>
          ) : (
            <ul className="space-y-2">
              {links.map((l) => (
                <li
                  key={l.token}
                  className="flex items-center justify-between rounded border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-sm"
                >
                  <span className="text-neutral-300">
                    {SHARE_ROLE_OPTIONS.find((o) => o.value === l.role)
                      ?.label ?? l.role}{" "}
                    · {l.useCount} uses
                    {l.expiresAt &&
                      ` · Expires ${new Date(l.expiresAt).toLocaleDateString()}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRevoke(l.token)}
                    className="text-red-400 hover:underline"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={loadLinks}
            className="mt-2 text-sm text-blue-400 hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>
    </Modal>
  );
}
