import type { ProcessingProgress, ProcessingStep } from "../../types/progress";

interface ProcessingProgressBarProps {
  progress: ProcessingProgress;
  onClose?: () => void;
}

export function ProcessingProgressBar({
  progress,
  onClose,
}: ProcessingProgressBarProps) {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStepIcon = (step: ProcessingStep) => {
    switch (step.status) {
      case "completed":
        return "✓";
      case "processing":
        return "⟳";
      case "error":
        return "✗";
      default:
        return "○";
    }
  };

  const getStepColor = (step: ProcessingStep) => {
    switch (step.status) {
      case "completed":
        return "text-green-600";
      case "processing":
        return "text-blue-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-400";
    }
  };

  const elapsedTime = Date.now() - progress.startTime;
  const elapsedSeconds = Math.floor(elapsedTime / 1000);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-6 max-w-2xl w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Processing PDF
          </h3>
          <p className="text-sm text-gray-600">
            {progress.fileKey.split("/").pop()}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Overall Progress */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            Overall Progress
          </span>
          <span className="text-sm text-gray-600">
            {Math.round(progress.overallProgress)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress.overallProgress}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <span>Elapsed: {formatTime(elapsedSeconds)}</span>
          {progress.estimatedTimeRemaining && (
            <span>
              Remaining: ~{formatTime(progress.estimatedTimeRemaining)}
            </span>
          )}
        </div>
      </div>

      {/* Current Step */}
      <div className="mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-sm font-medium text-gray-700">Current:</span>
          <span className="text-sm text-blue-600 font-medium">
            {progress.currentStep}
          </span>
        </div>
        {progress.steps.find((s) => s.status === "processing")?.description && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-blue-700">
                Processing...
              </span>
            </div>
            <p className="text-sm text-blue-800">
              {
                progress.steps.find((s) => s.status === "processing")
                  ?.description
              }
            </p>
          </div>
        )}
      </div>

      {/* Step Details */}
      <div className="space-y-3">
        {progress.steps.map((step) => (
          <div key={step.id} className="flex items-center space-x-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${getStepColor(step)}`}
            >
              {getStepIcon(step)}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  {step.name}
                </span>
                <span className="text-xs text-gray-500">{step.progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mt-1">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ease-out ${
                    step.status === "completed"
                      ? "bg-green-500"
                      : step.status === "processing"
                        ? "bg-blue-500"
                        : step.status === "error"
                          ? "bg-red-500"
                          : "bg-gray-300"
                  }`}
                  style={{ width: `${step.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-1 font-medium">
                {step.description}
              </p>
              {step.error && (
                <p className="text-xs text-red-500 mt-1">Error: {step.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Error Display */}
      {progress.error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">
            <strong>Error:</strong> {progress.error}
          </p>
        </div>
      )}
    </div>
  );
}
