import { Button } from "@/components/button/Button";
import { Input } from "@/components/input/Input";
import { cn } from "@/lib/utils";

interface UploadAuthProps {
  adminKey: string;
  setAdminKey: (value: string) => void;
  authenticating: boolean;
  handleSubmitAuth: () => void;
  showAuthInput: boolean;
  setShowAuthInput: (show: boolean) => void;
  setAuthPanelExpanded: (expanded: boolean) => void;
  isAuthPanelExpanded: boolean;
  authError: string | null;
  handleAuthenticate: () => void;
  className?: string;
}

export const UploadAuth = ({
  adminKey,
  setAdminKey,
  authenticating,
  handleSubmitAuth,
  showAuthInput,
  setShowAuthInput,
  setAuthPanelExpanded,
  isAuthPanelExpanded,
  authError,
  handleAuthenticate,
  className,
}: UploadAuthProps) => {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">
            PDF Upload Authentication
          </h3>
          <p className="text-ob-base-200 text-sm">
            You need to authenticate to upload and process PDF files.
          </p>
        </div>
        <Button
          onClick={() => setAuthPanelExpanded(!isAuthPanelExpanded)}
          variant="ghost"
          size="sm"
          className="text-ob-base-200 hover:text-ob-base-300"
        >
          {isAuthPanelExpanded ? "−" : "+"}
        </Button>
      </div>

      {isAuthPanelExpanded && (
        <>
          {authError && (
            <div className="text-ob-destructive text-sm">{authError}</div>
          )}

          {showAuthInput ? (
            <div className="space-y-3">
              <div className="space-y-3">
                <label
                  htmlFor="admin-key"
                  className="text-ob-base-300 text-sm font-medium mb-2 block"
                >
                  Admin Key
                </label>
                <Input
                  id="admin-key"
                  type="password"
                  placeholder="Enter admin key..."
                  value={adminKey}
                  onValueChange={setAdminKey}
                  disabled={authenticating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmitAuth();
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSubmitAuth}
                  variant="primary"
                  size="base"
                  loading={authenticating}
                  disabled={!adminKey.trim() || authenticating}
                >
                  {authenticating ? "Authenticating..." : "Authenticate"}
                </Button>
                <Button
                  onClick={() => {
                    setShowAuthInput(false);
                    setAdminKey("");
                  }}
                  variant="secondary"
                  size="base"
                  disabled={authenticating}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={handleAuthenticate} variant="primary" size="base">
              Start Authentication
            </Button>
          )}
        </>
      )}
    </div>
  );
};
