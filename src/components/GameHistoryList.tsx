import React, { useState } from "react";
import type { SessionSummary } from "../types";
import ConfirmationModal from "./ConfirmationModal";

interface GameHistoryListProps {
  sessions: SessionSummary[];
  onLoadGame: (sessionId: string) => void;
  onDeleteGame: (sessionId: string) => Promise<void>;
  isLoading: boolean; // To disable buttons while loading
}

const GameHistoryList: React.FC<GameHistoryListProps> = ({
  sessions,
  onLoadGame,
  onDeleteGame,
  isLoading,
}) => {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sessionToDeleteId, setSessionToDeleteId] = useState<string | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return dateString; // Fallback
    }
  };

  const handleDeleteClick = (sessionId: string) => {
    setSessionToDeleteId(sessionId);
    setShowConfirmModal(true);
  };

  const handleConfirmDelete = async () => {
    if (sessionToDeleteId) {
      setIsDeleting(true);
      try {
        await onDeleteGame(sessionToDeleteId);
      } catch (error) {
        console.error("Delete failed in list component:", error);
      } finally {
        setShowConfirmModal(false);
        setSessionToDeleteId(null);
        setIsDeleting(false);
      }
    }
  };

  const handleCancelDelete = () => {
    setShowConfirmModal(false);
    setSessionToDeleteId(null);
  };

  if (sessions.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-4">
        No past adventures found. Start a new one!
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg py-4 px-4 mx-4 sm:px-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
        Past Adventures
      </h2>
      <ul className="space-y-3">
        {sessions.map((session) => (
          <li
            key={session.session_id}
            className="border border-gray-200 dark:border-gray-700 rounded-md p-3"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex-grow min-w-0">
                <p
                  className="font-medium text-gray-900 dark:text-gray-100 truncate"
                  title={session.theme}
                >
                  {session.theme}
                </p>
                <p
                  className=" w-full text-sm text-gray-600 dark:text-gray-400 mt-1 italic truncate"
                  title={session.initial_scenario_snippet}
                >
                  "{session.initial_scenario_snippet}"
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Last Played: {formatDate(session.last_updated_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                <button
                  onClick={() => onLoadGame(session.session_id)}
                  disabled={isLoading || isDeleting}
                  className="px-4 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Resume this adventure"
                >
                  {isLoading ? "Loading..." : "Resume"}
                </button>
                <button
                  onClick={() => handleDeleteClick(session.session_id)}
                  disabled={isLoading || isDeleting}
                  className={`p-1.5 cursor-pointer bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-900 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    isDeleting && sessionToDeleteId === session.session_id
                      ? "animate-pulse"
                      : ""
                  }`}
                  title="Delete this adventure"
                >
                  {isDeleting && sessionToDeleteId === session.session_id ? (
                    <span className="text-xs">Deleting...</span>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {showConfirmModal && sessionToDeleteId && (
        <ConfirmationModal
          isOpen={showConfirmModal}
          title="Confirm Deletion"
          message="Are you sure you want to permanently delete this adventure? This action cannot be undone."
          onConfirm={handleConfirmDelete}
          onClose={handleCancelDelete}
          confirmText="Delete"
          cancelText="Cancel"
        />
      )}
    </div>
  );
};

export default GameHistoryList;
