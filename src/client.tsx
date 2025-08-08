import "./styles.css";
import { createRoot } from "react-dom/client";
import { Providers } from "@/providers";
import App from "./app";

const root = createRoot(document.getElementById("app")!);

root.render(
  <Providers>
    <div
      className="bg-neutral-50 text-base text-neutral-900 antialiased transition-colors selection:bg-blue-700 selection:text-white dark:bg-neutral-950 dark:text-neutral-100 font-sans"
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "Roboto", "Helvetica Neue", Arial, "Noto Sans", sans-serif',
        lineHeight: "1.75",
        letterSpacing: "-0.011em",
      }}
    >
      <App />
    </div>
  </Providers>
);
