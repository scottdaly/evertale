// src/components/HistorySidebar.tsx
import React, { useEffect, useRef } from "react";
import type { Turn, Player } from "../types";

interface HistorySidebarProps {
  history: Turn[];
  currentTurnIndex: number;
  onHistoryClick: (index: number) => void;
  isLoading: boolean;
  isMultiplayer: boolean;
  players: Player[];
  currentPlayerIndex: number | null;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({
  history,
  currentTurnIndex,
  onHistoryClick,
  isLoading,
  isMultiplayer,
  players,
  currentPlayerIndex,
}) => {
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll to bottom when history changes (new turn added)
  useEffect(() => {
    if (listRef.current) {
      const isNearBottom =
        listRef.current.scrollHeight -
          listRef.current.scrollTop -
          listRef.current.clientHeight <
        100;
      if (isNearBottom) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
  }, [history]); // Trigger only when history array itself changes

  // Find the name of the player who acted in a specific turn
  const getActingPlayerName = (turn: Turn): string | null => {
    if (
      !isMultiplayer ||
      turn.actingPlayerIndex === null ||
      turn.actingPlayerIndex === undefined
    ) {
      return null; // Not multiplayer or no actor info
    }
    return (
      players.find((p) => p.playerIndex === turn.actingPlayerIndex)
        ?.characterName || null
    );
  };

  return (
    <div className="h-full flex-shrink-0 w-full md:w-64 border-r-0 md:border-r border-gray-300 dark:border-gray-700 pr-0 mb-4 md:mb-0 flex flex-col">
      {/* Player List (Only in Multiplayer) */}
      {isMultiplayer && (
        <div className="mb-4 border-b border-gray-300 dark:border-gray-700 pb-3">
          <h4 className="text-md font-semibold mb-2 sticky top-0 bg-gray-100 dark:bg-gray-900 py-1 text-gray-800 dark:text-gray-200 px-1">
            Players ({players.length})
          </h4>
          <ul className="space-y-1.5 px-1 max-h-[20vh] overflow-y-auto">
            {players.map((player) => (
              <li
                key={player.userId}
                className={`flex items-center p-1.5 rounded-md transition-colors ${
                  player.playerIndex === currentPlayerIndex
                    ? "bg-blue-100 dark:bg-slate-700"
                    : "bg-transparent"
                }`}
                title={`${player.characterName} (${player.characterGender})`}
              >
                <img
                  src={
                    player.characterImageUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      player.characterName
                    )}&background=random&size=32`
                  }
                  alt={player.characterName}
                  className="w-6 h-6 rounded-full mr-2 flex-shrink-0 object-cover border border-gray-300 dark:border-gray-600"
                />
                <span
                  className={`text-sm truncate ${
                    player.playerIndex === currentPlayerIndex
                      ? "font-semibold text-blue-800 dark:text-blue-100"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {player.characterName}
                </span>
                {player.playerIndex === currentPlayerIndex && (
                  <span className="ml-auto text-xs font-bold text-blue-600 dark:text-blue-300 animate-pulse">
                    TURN
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* History List */}
      <div className="flex-grow flex flex-col min-h-0">
        <h3 className="text-lg font-semibold mb-3 sticky top-0 bg-gray-100 dark:bg-gray-900 py-2 text-gray-800 dark:text-gray-200 px-1">
          History
        </h3>
        <ul
          ref={listRef}
          className="space-y-1 overflow-y-auto flex-grow px-1" // Removed max-h, let flexbox handle height
        >
          {history.map((turn, index) => {
            const actingPlayerName = getActingPlayerName(turn);
            const turnTitle = turn.actionTaken
              ? `Turn ${turn.turnIndex}: ${
                  actingPlayerName ? `(${actingPlayerName}) ` : ""
                }${turn.actionTaken}`
              : "Turn 0: Starting Point";

            return (
              <li
                key={`${turn.turnIndex}-${index}-${
                  turn.actionTaken || "start"
                }`}
              >
                <button
                  // Disable history click in multiplayer for now
                  onClick={() =>
                    !isLoading && !isMultiplayer && onHistoryClick(index)
                  }
                  disabled={
                    isLoading || index === currentTurnIndex || isMultiplayer
                  }
                  title={turnTitle}
                  className={`
                    w-full text-left px-3 py-2 rounded-md transition-colors duration-150 text-sm group
                    ${
                      index === currentTurnIndex
                        ? "bg-blue-600 dark:bg-slate-600 text-white font-semibold shadow-sm cursor-default"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }
                    ${
                      isLoading || isMultiplayer
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    } 
                  `}
                >
                  {/* Turn Number and Text Snippet */}
                  <span className="block font-medium truncate">
                    Turn {turn.turnIndex}: {turn.scenarioText.substring(0, 30)}
                    ...
                  </span>
                  {/* Action Taken (Show only if exists) */}
                  {turn.actionTaken && (
                    <span className="block text-xs opacity-80 group-hover:opacity-100 truncate mt-0.5">
                      {actingPlayerName && (
                        <span className="font-medium">
                          {actingPlayerName}:{" "}
                        </span>
                      )}
                      {turn.actionTaken}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default HistorySidebar;
