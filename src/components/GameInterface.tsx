// src/components/GameInterface.tsx
import React from "react";
import type { Turn, Character, Player } from "../types";
import HistorySidebar from "./HistorySidebar";
import ActionInput from "./ActionInput";

interface GameInterfaceProps {
  currentTurn: Turn | null;
  history: Turn[];
  currentTurnIndex: number;
  isLoading: boolean;
  onActionSubmit: (action: string) => void;
  onHistoryClick: (index: number) => void;
  isMultiplayer: boolean;
  players: Player[];
  currentPlayerIndex: number | null;
  currentUserId?: string;
}

const GameInterface: React.FC<GameInterfaceProps> = ({
  currentTurn,
  history,
  currentTurnIndex,
  isLoading,
  onActionSubmit,
  onHistoryClick,
  isMultiplayer,
  players,
  currentPlayerIndex,
  currentUserId,
}) => {
  if (!currentTurn) {
    return <div>Loading game state...</div>; // Or some other placeholder
  }

  const showImageLoading = isLoading && currentTurnIndex === history.length - 1;

  const isMyTurn =
    isMultiplayer && currentUserId
      ? players.find((p) => p.userId === currentUserId)?.playerIndex ===
        currentPlayerIndex
      : false;

  const activePlayerName =
    isMultiplayer && currentPlayerIndex !== null
      ? players.find((p) => p.playerIndex === currentPlayerIndex)
          ?.characterName || "Unknown Player"
      : null;

  return (
    <div className="game-interface flex flex-col md:flex-row mt-4 gap-6 relative">
      <HistorySidebar
        history={history}
        currentTurnIndex={currentTurnIndex}
        onHistoryClick={onHistoryClick}
        isLoading={isLoading}
        isMultiplayer={isMultiplayer}
        players={players}
        currentPlayerIndex={currentPlayerIndex}
      />
      {/* Main content area */}
      <div className="main-content flex-1 flex flex-col min-w-0">
        {" "}
        {/* min-w-0 prevents flexbox overflow */}
        {isMultiplayer && (
          <div className="mb-2 p-2 bg-blue-100 dark:bg-slate-700 border border-blue-200 dark:border-slate-600 rounded-md text-center text-sm font-medium text-blue-800 dark:text-blue-100">
            {activePlayerName ? (
              <span>
                Turn: <strong>{activePlayerName}</strong>
                {isMyTurn ? " (You)" : ""}
              </span>
            ) : (
              <span>Waiting for players...</span>
            )}
          </div>
        )}
        <div className="flex flex-col min-w-0 border border-gray-200 dark:border-gray-700 rounded-lg">
          {/* Image View */}
          <div className="image-view w-full aspect-video bg-gray-200 dark:bg-gray-800 rounded-t-lg overflow-hidden relative self-center">
            {/* Conditional Loading Overlay */}
            {/* {showImageLoading && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white text-lg font-semibold z-10">
              Generating Image...
            </div>
          )} */}
            {/* Image */}
            <img
              src={currentTurn.imageUrl}
              alt={currentTurn.imagePrompt || "Adventure scene"}
              // Basic image styling
              className={`block w-full h-full object-cover transition-opacity duration-300`}
              onError={(e) =>
                (e.currentTarget.src =
                  "https://via.placeholder.com/600x337.png?text=Image+Error")
              } // Basic error fallback
            />
            {/* Image Prompt Display */}
            <p className="image-prompt-display text-xs text-gray-500 dark:text-gray-400 text-center italic px-2 py-1">
              <em>{currentTurn.imagePrompt}</em>
            </p>
          </div>
          {/* Narrative View */}
          <div className="bg-white dark:bg-transparent p-4 sm:p-6 rounded-b-lg dark:border-gray-700 min-h-[120px]">
            {/* <div className="mb-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 italic">
              ({currentTurn.timeOfDay || "Time not specified"})
            </div> */}
            {/* Use prose for better text formatting if needed */}
            <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
              {currentTurn.scenarioText}
            </p>
            {/* {currentTurn.characters && currentTurn.characters.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                <h4 className="text-sm font-semibold mb-2 text-gray-600 dark:text-gray-300">
                  Characters Present:
                </h4>
                <ul className="space-y-3">
                  {currentTurn.characters.map((char, index) => (
                    <li
                      key={index}
                      className="text-sm text-gray-700 dark:text-gray-300"
                    >
                      <strong className="font-medium text-gray-900 dark:text-white">
                        {char.name}:
                      </strong>
                      <p className="text-xs text-gray-600 dark:text-gray-400 pl-2 italic">
                        {char.description} Appearance: {char.appearance}.
                      </p>
                      Optionally display opinion if desired}
                       <p className="text-xs text-gray-500 dark:text-gray-500 pl-2">Opinion: {char.opinionOfPlayer}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )} */}
          </div>
        </div>
        {/* Action Input */}
        {isLoading ? (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2 py-12">
            <div className="flex flex-col items-center justify-center gap-2">
              <div className="flex items-center justify-center">
                <svg
                  aria-hidden="true"
                  className="w-8 h-8 text-gray-300 animate-spin dark:text-gray-600 fill-gray-600 dark:fill-gray-200"
                  viewBox="0 0 100 101"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                    fill="currentColor"
                  />
                  <path
                    d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                    fill="currentFill"
                  />
                </svg>
                <span className="sr-only">Loading...</span>
              </div>

              <span className="text-lg">Progressing the story...</span>
            </div>
          </div>
        ) : (
          <ActionInput
            suggestedActions={currentTurn.suggestedActions}
            onActionSubmit={onActionSubmit}
            isLoading={isLoading}
            isMultiplayer={isMultiplayer}
            isMyTurn={isMyTurn}
            activePlayerName={activePlayerName}
          />
        )}
        {/* <div className="flex flex-col min-w-0 border border-gray-200 dark:border-gray-700 rounded-lg">
          <p>{JSON.stringify(currentTurn, null, 2)}</p>
        </div> */}
      </div>
    </div>
  );
};

export default GameInterface;
