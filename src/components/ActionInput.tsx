// src/components/ActionInput.tsx
import React, { useState, useEffect } from "react";

interface ActionInputProps {
  suggestedActions: string[];
  onActionSubmit: (action: string) => void;
  isLoading: boolean;
  isMultiplayer: boolean;
  isMyTurn: boolean;
  activePlayerName: string | null;
}

const ActionInput: React.FC<ActionInputProps> = ({
  suggestedActions,
  onActionSubmit,
  isLoading,
  isMultiplayer,
  isMyTurn,
  activePlayerName,
}) => {
  const [customAction, setCustomAction] = useState("");
  const [errorText, setErrorText] = useState("");

  const isDisabled = isLoading || (isMultiplayer && !isMyTurn);

  const handleCustomSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isDisabled) return;

    if (!customAction.trim()) {
      setErrorText(
        "Can't submit an empty action! Please enter an action or select one of the options to continue"
      );
      return;
    }
    if (customAction.trim()) {
      onActionSubmit(customAction.trim());
      setCustomAction("");
      setErrorText("");
    }
  };

  const handleSuggestionClick = (action: string) => {
    if (!isDisabled) {
      onActionSubmit(action);
      setCustomAction("");
      setErrorText("");
    }
  };

  useEffect(() => {
    setCustomAction("");
    setErrorText("");
  }, [suggestedActions, isMyTurn]);

  return (
    <div className="action-input pt-8 dark:border-gray-700">
      {/* --- Disabled Overlay/Message (Shows ABOVE the input area when not my turn) --- */}
      {isMultiplayer && !isMyTurn && (
        <div className="text-center text-lg font-semibold text-gray-600 dark:text-gray-400 italic mb-6 py-4 px-3 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-300 dark:border-gray-700">
          Waiting for {activePlayerName || "next player"}'s turn...
        </div>
      )}
      {/* --- Input Area (conditionally disabled/styled, but always rendered) --- */}
      {/* Add relative positioning if needed for future overlays */}
      <div
        className={`relative ${
          isDisabled ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {/* Suggested Actions Section */}
        <div className="suggested-actions flex flex-wrap gap-2 mb-6">
          {suggestedActions.length > 0 ? (
            suggestedActions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(action)}
                disabled={isDisabled} // Use combined disabled state
                title={action}
                className="flex-grow basis-1/3 sm:basis-auto border border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-md text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="truncate block">{action}</span>
              </button>
            ))
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No suggested actions available.
            </p>
          )}
        </div>

        {/* Custom Action Section */}
        <form
          onSubmit={handleCustomSubmit}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={customAction}
            onChange={(e) => {
              setCustomAction(e.target.value);
              setErrorText("");
            }}
            // Adjust placeholder based on whose turn it is
            placeholder={
              isMultiplayer
                ? isMyTurn
                  ? "What do you do next?"
                  : ""
                : "What do you do next?"
            }
            disabled={isDisabled} // Use combined disabled state
            className={`flex-grow px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800 ${
              errorText ? "border-red-600 dark:border-red-400" : ""
            }`}
          />
          <button
            type="submit"
            disabled={isDisabled} // Use combined disabled state
            className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-900 dark:disabled:bg-slate-700 dark:disabled:text-slate-200"
          >
            {/* Adjust button text slightly when waiting */}
            {isLoading
              ? "Processing..."
              : isMultiplayer && !isMyTurn
              ? "Waiting..."
              : "Submit Action"}
          </button>
        </form>
        {errorText && (
          <p className="text-red-600 dark:text-red-400 text-sm mt-2">
            {errorText}
          </p>
        )}
      </div>{" "}
      {/* Closing tag for the main input area wrapper */}
    </div>
  );
};

export default ActionInput;
