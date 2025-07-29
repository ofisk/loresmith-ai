import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { API_CONFIG } from "../../shared";
import { Button } from "../button/Button";
import { Card } from "../card/Card";
import { Loader } from "../loader/Loader";

interface CharacterSheet {
  id: string;
  fileName: string;
  fileType: string;
  characterName?: string;
  description?: string;
  status: string;
  createdAt: string;
}

interface CharacterSheetListProps {
  campaignId: string;
  className?: string;
  onCharacterSheetRemoved?: (characterSheetId: string) => void;
}

export function CharacterSheetList({
  campaignId,
  className,
  onCharacterSheetRemoved,
}: CharacterSheetListProps) {
  const [characterSheets, setCharacterSheets] = useState<CharacterSheet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);

  const fetchCharacterSheets = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.LIST(campaignId)
        )
      );

      if (!response.ok) {
        throw new Error("Failed to fetch character sheets");
      }

      const data = (await response.json()) as {
        characterSheets: CharacterSheet[];
      };
      setCharacterSheets(data.characterSheets || []);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch character sheets";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  const handleRemoveCharacterSheet = async (characterSheetId: string) => {
    try {
      setIsRemoving(characterSheetId);
      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.DETAILS(characterSheetId)
        ),
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to remove character sheet");
      }

      toast.success("Character sheet removed successfully!");
      setCharacterSheets(
        characterSheets.filter((cs) => cs.id !== characterSheetId)
      );
      onCharacterSheetRemoved?.(characterSheetId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to remove character sheet";
      toast.error(message);
    } finally {
      setIsRemoving(null);
    }
  };

  useEffect(() => {
    fetchCharacterSheets();
  }, [fetchCharacterSheets]);

  const getFileTypeIcon = (fileType: string) => {
    switch (fileType) {
      case "pdf":
        return "📄";
      case "docx":
      case "doc":
        return "📝";
      case "txt":
        return "📄";
      case "json":
        return "🔧";
      default:
        return "📎";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-50";
      case "processing":
        return "text-yellow-600 bg-yellow-50";
      case "error":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className={`flex justify-center items-center p-8 ${className}`}>
        <Loader />
      </div>
    );
  }

  if (characterSheets.length === 0) {
    return (
      <div className={`text-center p-8 text-gray-500 ${className}`}>
        <p>No character sheets uploaded yet.</p>
        <p className="text-sm mt-2">
          Upload character sheets to keep them organized with your campaign.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-lg font-semibold">Character Sheets</h3>
      <div className="grid gap-4">
        {characterSheets.map((characterSheet) => (
          <Card key={characterSheet.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <div className="text-2xl">
                  {getFileTypeIcon(characterSheet.fileType)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 truncate">
                    {characterSheet.fileName}
                  </h4>
                  {characterSheet.characterName && (
                    <p className="text-sm text-gray-600">
                      Character: {characterSheet.characterName}
                    </p>
                  )}
                  {characterSheet.description && (
                    <p className="text-sm text-gray-500 mt-1">
                      {characterSheet.description}
                    </p>
                  )}
                  <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                    <span>Type: {characterSheet.fileType.toUpperCase()}</span>
                    <span>
                      Uploaded: {formatDate(characterSheet.createdAt)}
                    </span>
                    <span
                      className={`px-2 py-1 rounded-full ${getStatusColor(
                        characterSheet.status
                      )}`}
                    >
                      {characterSheet.status}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    // TODO: Implement view/download functionality
                    toast("View/download functionality coming soon!");
                  }}
                >
                  View
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemoveCharacterSheet(characterSheet.id)}
                  disabled={isRemoving === characterSheet.id}
                >
                  {isRemoving === characterSheet.id ? (
                    <Loader className="w-4 h-4" />
                  ) : (
                    "Remove"
                  )}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
