import { useState, useEffect } from "react";
import { PdfUpload } from "./PdfUpload";
import { usePdfUpload } from "@/hooks/usePdfUpload";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { cn } from "@/lib/utils";

interface PdfUploadSectionProps {
  sessionId: string;
  className?: string;
}

export const PdfUploadSection = ({ sessionId, className }: PdfUploadSectionProps) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const { uploadPdf, loading } = usePdfUpload({
    sessionId,
    onSuccess: (result) => {
      console.log("PDF uploaded successfully:", result);
      setShowUpload(false);
      // You could add a success notification here
    },
    onError: (error) => {
      console.error("PDF upload failed:", error);
      // You could add an error notification here
    },
  });

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, [sessionId]);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`/pdf/files?sessionId=${sessionId}`);
      if (response.ok) {
        setIsAuthenticated(true);
        setAuthError(null);
      } else if (response.status === 401) {
        setIsAuthenticated(false);
        setAuthError("Session not authenticated");
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
      setAuthError("Failed to check authentication status");
    }
  };

  const handleUpload = async (file: File, description: string, tags: string[]) => {
    await uploadPdf(file, description, tags);
  };

  if (!isAuthenticated) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">PDF Upload</h3>
          <p className="text-ob-base-200 text-sm">
            Please provide your admin key to enable PDF upload functionality.
          </p>
        </div>
        {authError && (
          <div className="text-ob-destructive text-sm">
            {authError}
          </div>
        )}
      </Card>
    );
  }

  if (!showUpload) {
    return (
      <Card className={cn("space-y-4", className)}>
        <div className="space-y-2">
          <h3 className="text-ob-base-300 font-medium">PDF Upload</h3>
          <p className="text-ob-base-200 text-sm">
            You can now upload PDF files for processing and analysis.
          </p>
        </div>
        <Button
          onClick={() => setShowUpload(true)}
          variant="primary"
          size="base"
        >
          Upload PDF
        </Button>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-ob-base-300 font-medium">Upload PDF</h3>
            <Button
              onClick={() => setShowUpload(false)}
              variant="ghost"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Card>
      
      <PdfUpload
        onUpload={handleUpload}
        loading={loading}
      />
    </div>
  );
}; 