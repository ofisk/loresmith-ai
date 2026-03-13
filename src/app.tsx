import { AppModals } from "@/components/app/AppModals";
import { AppShell } from "@/components/app/AppShell";
import { BillingPage } from "@/components/billing/BillingPage";
import { JoinCampaignPage } from "@/components/join/JoinCampaignPage";
import {
	AppShellProvider,
	useAppShellContext,
} from "@/contexts/AppShellContext";
import type { Campaign } from "@/types/campaign";

export default function Chat() {
	return (
		<AppShellProvider>
			<ChatContent />
		</AppShellProvider>
	);
}

function ChatContent() {
	const {
		showBillingPage,
		joinToken,
		modalState,
		authState,
		campaigns,
		refetchCampaigns,
		createCampaign,
		handleUpload,
		handleFileUpdate,
		addFileToCampaigns,
		addLocalNotification,
		onProposalConfirm,
		onProposalCancel,
		billingStatus,
		handleJoinSuccess,
	} = useAppShellContext();

	if (showBillingPage) {
		return <BillingPage onBack={() => (window.location.href = "/")} />;
	}

	if (joinToken) {
		return (
			<>
				<JoinCampaignPage
					token={joinToken}
					jwt={authState.getStoredJwt()}
					onOpenAuthModal={() => modalState.setShowAuthModal(true)}
					onJoinSuccess={handleJoinSuccess}
				/>
				<AppModals
					billingLimits={billingStatus?.limits}
					modalState={modalState}
					authState={authState}
					campaigns={campaigns}
					refetchCampaigns={refetchCampaigns as () => Promise<Campaign[]>}
					createCampaign={
						createCampaign as (
							name: string,
							description?: string
						) => Promise<Campaign>
					}
					handleUpload={handleUpload}
					handleFileUpdate={handleFileUpdate}
					addFileToCampaigns={addFileToCampaigns}
					addLocalNotification={(type, title, message?) =>
						addLocalNotification(type, title, message ?? "")
					}
					onProposalConfirm={onProposalConfirm}
					onProposalCancel={onProposalCancel}
				/>
			</>
		);
	}

	return (
		<>
			<AppShell />
			<AppModals
				billingLimits={billingStatus?.limits}
				modalState={modalState}
				authState={authState}
				campaigns={campaigns}
				refetchCampaigns={refetchCampaigns as () => Promise<Campaign[]>}
				createCampaign={
					createCampaign as (
						name: string,
						description?: string
					) => Promise<Campaign>
				}
				handleUpload={handleUpload}
				handleFileUpdate={handleFileUpdate}
				addFileToCampaigns={addFileToCampaigns}
				addLocalNotification={(type, title, message?) =>
					addLocalNotification(type, title, message ?? "")
				}
				onProposalConfirm={onProposalConfirm}
				onProposalCancel={onProposalCancel}
			/>
		</>
	);
}
