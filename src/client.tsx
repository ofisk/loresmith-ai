import "./styles.css";
import { createRoot } from "react-dom/client";
import { ActionQueueProvider } from "@/contexts/ActionQueueContext";
import { UploadQueueProvider } from "@/contexts/UploadQueueContext";
import { Providers } from "@/providers";
import App from "./app";
import { NotificationProvider } from "./components/notifications/NotificationProvider";

document.documentElement.classList.add("dark");

const root = createRoot(document.getElementById("app")!);

root.render(
	<Providers>
		<NotificationProvider>
			<div
				className="bg-neutral-50 text-base text-neutral-900 antialiased transition-colors selection:bg-blue-700 selection:text-white dark:bg-neutral-950 dark:text-neutral-100 font-sans min-w-0 max-w-full overflow-x-hidden"
				style={{
					fontFamily:
						'-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Roboto", "Helvetica Neue", Arial, "Noto Sans", sans-serif',
					lineHeight: "1.75",
					letterSpacing: "-0.011em",
				}}
			>
				<UploadQueueProvider>
					<ActionQueueProvider>
						<App />
					</ActionQueueProvider>
				</UploadQueueProvider>
			</div>
		</NotificationProvider>
	</Providers>
);
