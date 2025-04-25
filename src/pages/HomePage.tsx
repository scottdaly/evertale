import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getGameHistoryList, deleteSession } from "../services/api";
import type { SessionListItem } from "../types";
import { formatDistanceToNow } from "date-fns";
import { TrashIcon } from "@heroicons/react/24/outline";
// Theme definitions (consider moving to a shared constants file)
const themes = [
  {
    name: "Fantasy",
    description: "Embark on an epic quest in a world of magic and monsters.",
    emoji: "🧙‍♂️",
  },
  {
    name: "Sci-Fi",
    description: "Explore distant galaxies and encounter alien civilizations.",
    emoji: "🚀",
  },
  {
    name: "Apocalyptic",
    description: "Survive the end of the world and rebuild civilization.",
    emoji: "☣️",
  },
  {
    name: "Mystery",
    description: "Unravel clues and solve perplexing cases.",
    emoji: "🔍",
  },
  {
    name: "Horror",
    description: "Survive chilling encounters and escape terrifying entities.",
    emoji: "👻",
  },
  {
    name: "Romance",
    description: "Explore the complexities of love and relationships.",
    emoji: "💖",
  },
];

interface HomePageProps {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsHistoryLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDeletingSession: React.Dispatch<React.SetStateAction<boolean>>;
  combinedLoading: boolean; // Consolidated loading state from App
  logout: () => void;
}

const HomePage: React.FC<HomePageProps> = ({
  setError,
  setIsHistoryLoading,
  setIsDeletingSession,
  combinedLoading,
  logout,
}) => {
  const navigate = useNavigate();
  const { user } = useAuth(); // Get user info if needed for display
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [inviteCode, setInviteCode] = useState<string>("");

  // --- Fetch History ---
  const fetchHistory = useCallback(async () => {
    setIsHistoryLoading(true);
    setError(null);
    try {
      const historyData = await getGameHistoryList();
      setSessions(historyData);
    } catch (err: any) {
      setError(
        `Failed to load session history: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`
      );
      if (err.response?.status === 401 || err.response?.status === 403) {
        logout();
      }
    } finally {
      setIsHistoryLoading(false);
    }
  }, [setIsHistoryLoading, setError, logout]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // --- Handlers ---
  const handleNavigate = (path: string, state?: any) => {
    if (!combinedLoading) {
      navigate(path, { state });
    }
  };

  const handleJoinGame = () => {
    if (!inviteCode.trim() || combinedLoading) return;
    navigate(`/join/${encodeURIComponent(inviteCode.trim())}`);
  };

  const handleDelete = async (sessionId: string) => {
    if (combinedLoading) return;
    const confirmation = window.confirm(
      "Are you sure you want to delete this game session? This cannot be undone."
    );
    if (!confirmation) return;

    setIsDeletingSession(true);
    setError(null);
    try {
      await deleteSession(sessionId);
      // Refresh history list after deletion
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
      // Optionally show a success message
    } catch (err: any) {
      setError(
        `Failed to delete session: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`
      );
      if (err.response?.status === 401 || err.response?.status === 403) {
        logout();
      }
    } finally {
      setIsDeletingSession(false);
    }
  };

  return (
    <div className="homepage-container space-y-12">
      {/* --- Welcome Message (Optional) --- */}
      {user && (
        <h1 className="text-2xl font-semibold text-center text-gray-800 dark:text-gray-200">
          Welcome back, {user.name || user.email}!
        </h1>
      )}

      {/* --- Start/Join Game Section --- */}
      <div className="start-join-section bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100 border-b pb-3 dark:border-gray-600">
          Start a New Adventure
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {themes.map((theme) => (
            <div
              key={theme.name}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col justify-between "
            >
              <div>
                <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-100">
                  {theme.emoji} {theme.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {theme.description}
                </p>
              </div>
              <div className="flex flex-col gap-2 mt-auto">
                {/* Pass isMultiplayer flag in route state */}
                <button
                  onClick={() =>
                    handleNavigate(
                      `/create/${encodeURIComponent(theme.name)}`,
                      { isMultiplayer: false }
                    )
                  }
                  disabled={combinedLoading}
                  className="flex-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-3 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                  title={`Start Single Player ${theme.name} Game`}
                >
                  Single Player
                </button>
                <button
                  onClick={() =>
                    handleNavigate(
                      `/create/${encodeURIComponent(theme.name)}`,
                      { isMultiplayer: true }
                    )
                  }
                  disabled={combinedLoading}
                  className="flex-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-3 border border-gray-400 dark:border-gray-600 text-gray-900 dark:text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
                  title={`Start Multiplayer ${theme.name} Game`}
                >
                  Multiplayer
                </button>
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100 border-b pb-3 dark:border-gray-600">
          Join Multiplayer Game
        </h2>
        <div className="flex items-center gap-3 max-w-md">
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Enter Invite Code (e.g., INV-ABCDEF12)"
            disabled={combinedLoading}
            className="flex-grow px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:opacity-50"
            maxLength={12} // INV- + 8 chars
          />
          <button
            onClick={handleJoinGame}
            disabled={combinedLoading || !inviteCode.trim()}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:bg-green-400 dark:disabled:bg-green-800"
          >
            Join
          </button>
        </div>
      </div>

      {/* --- Past Sessions Section --- */}
      <div className="past-sessions-section">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Continue Adventure
        </h2>
        {combinedLoading && sessions.length === 0 ? (
          <p className="text-center text-gray-500 dark:text-gray-400">
            Loading sessions...
          </p>
        ) : sessions.length > 0 ? (
          <ul className="space-y-4">
            {sessions.map((session) => (
              <li
                key={session.session_id}
                className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
              >
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {session.isMultiplayer && (
                      <span
                        title={`Multiplayer (${session.playerCount} players)`}
                        className="inline-block bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs font-semibold px-2 py-0.5 rounded"
                      >
                        👥 {session.playerCount}
                      </span>
                    )}
                    <h3
                      className="text-lg font-semibold text-gray-800 dark:text-gray-100 truncate"
                      title={session.theme}
                    >
                      {session.theme}
                    </h3>
                  </div>
                  <p
                    className="text-sm text-gray-500 dark:text-gray-400 truncate italic mb-1"
                    title={session.initial_scenario_snippet}
                  >
                    "{session.initial_scenario_snippet}"
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Last updated:{" "}
                    {formatDistanceToNow(new Date(session.last_updated_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2 mt-2 sm:mt-0">
                  <button
                    onClick={() =>
                      handleNavigate(
                        `/play/${encodeURIComponent(session.session_id)}`
                      )
                    }
                    disabled={combinedLoading}
                    className="px-4 py-1 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                  >
                    Continue
                  </button>
                  <button
                    onClick={() => handleDelete(session.session_id)}
                    disabled={combinedLoading}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
                    title="Delete Session"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-gray-500 dark:text-gray-400 italic">
            No past adventures found. Start a new one!
          </p>
        )}
      </div>
    </div>
  );
};

export default HomePage;
