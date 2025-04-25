import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client"; // Import Socket type
import { useAuth } from "../context/AuthContext";
import GameInterface from "../components/GameInterface";
import { getSessionHistory, submitAction } from "../services/api";
import type { SessionState } from "../types";
import toast from "react-hot-toast"; // Import toast
import { ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline"; // Import icons
import {
  WifiIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/20/solid"; // Import icons for connection status

// Helper function to get session ID parameter safely
const useSessionIdParam = () => {
  const { sessionId: sessionIdParam } = useParams<{ sessionId: string }>();
  return sessionIdParam ? decodeURIComponent(sessionIdParam) : null;
};

// Define props specifically for PlayPage
interface PlayPageProps {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsGameLoading: React.Dispatch<React.SetStateAction<boolean>>; // For actions
  setIsHistoryLoading: React.Dispatch<React.SetStateAction<boolean>>; // For session load
  isGlobalAuthLoading: boolean;
  isGlobalGameLoading: boolean;
  isGlobalHistoryLoading: boolean;
  isGlobalDeletingSession: boolean;
  logout: () => void;
}

// --- Copy Helper ---
const copyToClipboard = async (text: string, onCopy?: () => void) => {
  try {
    await navigator.clipboard.writeText(text);
    console.log("Invite code copied to clipboard");
    if (onCopy) onCopy(); // Call callback on success
  } catch (err) {
    console.error("Failed to copy invite code: ", err);
    toast.error("Failed to copy code."); // Show error toast
  }
};

// --- Connection Status Type ---
type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting";

const PlayPage = ({
  setError,
  setIsGameLoading,
  setIsHistoryLoading,
  isGlobalAuthLoading,
  isGlobalGameLoading,
  isGlobalHistoryLoading,
  isGlobalDeletingSession,
  logout,
}: PlayPageProps) => {
  const navigate = useNavigate();
  const sessionId = useSessionIdParam();
  const { isAuthenticated, idToken, user } = useAuth(); // Correctly use idToken
  const currentError = useState<string | null>(null)[0];

  // --- State for PlayPage ---
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [currentTurnIndex, setCurrentTurnIndex] = useState<number>(0);
  const socketRef = useRef<Socket | null>(null);
  const [didShowInviteToast, setDidShowInviteToast] = useState(false); // Prevent re-showing toast on hot reload
  const [copiedCode, setCopiedCode] = useState(false); // State for copy button feedback
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  // --- End State ---

  // Define isMultiplayerGame in component scope
  const isMultiplayerGame = sessionState?.isMultiplayer;

  const combinedLoading =
    isGlobalAuthLoading ||
    isGlobalGameLoading ||
    isGlobalHistoryLoading ||
    isGlobalDeletingSession;

  // Loading specifically for GameInterface
  const gameInterfaceLoading =
    isGlobalGameLoading || (isGlobalHistoryLoading && !sessionState); // Show loading if history load is happening and we have no state yet

  // --- Load Game and Initialize WebSocket Effect ---
  useEffect(() => {
    if (!sessionId || !isAuthenticated || !idToken || !user) {
      if (!isAuthenticated) console.log("PlayPage: Not authenticated.");
      else if (!sessionId) console.warn("PlayPage: Session ID missing.");
      else if (!idToken) console.warn("PlayPage: Auth token missing.");
      else if (!user) console.warn("PlayPage: User info missing.");
      navigate("/", { replace: true });
      return;
    }

    let isMounted = true;

    const loadGameAndConnect = async () => {
      console.log(`PlayPage: Loading session ${sessionId}`);
      setIsHistoryLoading(true);
      setSessionState(null); // Reset state on load
      setCurrentTurnIndex(0);
      setError(null);

      try {
        const loadedState = await getSessionHistory(sessionId!);
        if (isMounted) {
          // Add more specific logging around the check
          const historyLength = loadedState.history
            ? loadedState.history.length
            : 0;
          console.log(
            `PlayPage DEBUG: Received history length: ${historyLength}`
          );
          console.log(
            `PlayPage DEBUG: Checking if historyLength > 0: ${
              historyLength > 0
            }`
          );

          if (historyLength > 0) {
            console.log(
              "PlayPage: Session loaded (History length > 0 check PASSED):",
              loadedState
            );
            setSessionState(loadedState);
            setCurrentTurnIndex(historyLength - 1);

            // --- Check for and Display Invite Code Toast ---
            if (!didShowInviteToast) {
              // Only show once per mount
              const inviteCodeKey = `inviteCode_${sessionId}`;
              const inviteCode = sessionStorage.getItem(inviteCodeKey);

              if (inviteCode) {
                console.log(
                  "Found invite code in sessionStorage, displaying toast."
                );
                setCopiedCode(false); // Reset copied state
                toast.custom(
                  (t) => (
                    <div
                      className={`${
                        t.visible ? "animate-enter" : "animate-leave"
                      } 
                                 max-w-md w-full bg-gray-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 text-gray-100 p-4`}
                    >
                      <div className="flex-1 w-0">
                        <p className="text-sm font-medium">
                          Game created! Invite friends:
                        </p>
                        <div className="mt-2 flex items-center bg-gray-700 p-2 rounded">
                          <input
                            type="text"
                            readOnly
                            value={inviteCode}
                            className="flex-1 bg-transparent text-lg font-mono tracking-wider outline-none border-none text-yellow-300 p-0 mr-2"
                          />
                          <button
                            onClick={() =>
                              copyToClipboard(inviteCode, () =>
                                setCopiedCode(true)
                              )
                            }
                            className="p-1.5 rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors"
                            title={copiedCode ? "Copied!" : "Copy Invite Code"}
                          >
                            {copiedCode ? (
                              <CheckIcon
                                className="h-5 w-5 text-green-400"
                                aria-hidden="true"
                              />
                            ) : (
                              <ClipboardDocumentIcon
                                className="h-5 w-5"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex border-l border-gray-600 ml-4 pl-4">
                        <button
                          onClick={() => toast.dismiss(t.id)}
                          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-indigo-400 hover:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ),
                  { duration: 15000 } // Keep toast longer
                );
                sessionStorage.removeItem(inviteCodeKey); // Remove after showing
                setDidShowInviteToast(true);
              }
            }
            // -----------------------------------------------

            // --- Initialize WebSocket if Multiplayer ---
            if (loadedState.isMultiplayer) {
              console.log(
                `PlayPage: Session ${sessionId} is multiplayer. Initializing WebSocket.`
              );
              if (socketRef.current) {
                socketRef.current.disconnect();
              }

              setConnectionStatus("connecting"); // Set initial status

              // Determine backend URL: Use env var if set, otherwise use current origin (relative path for socket.io)
              // This ensures connections go to the same domain the site is hosted on (e.g., infiniteadventure.co)
              const backendUrl =
                import.meta.env.VITE_BACKEND_URL || window.location.origin;
              console.log(`PlayPage: Connecting WebSocket to ${backendUrl}`); // Log the URL

              const newSocket = io(backendUrl, {
                reconnectionAttempts: 5, // Example: Limit attempts
                reconnectionDelay: 1000, // Start delay 1s
                reconnectionDelayMax: 5000, // Max delay 5s
                // Ensure path matches server configuration if needed (usually defaults to /socket.io/)
                // path: "/socket.io/" // Typically not needed unless server path is customized
              });
              socketRef.current = newSocket;

              // --- WebSocket Event Listeners ---
              newSocket.on("connect", () => {
                console.log(
                  `PlayPage: WebSocket connected: ${newSocket.id}. Authenticating...`
                );
                setConnectionStatus("connected"); // Set status
                newSocket.emit("authenticate", { token: idToken, sessionId });
              });

              newSocket.on("authenticated", () => {
                console.log(
                  `PlayPage: WebSocket authenticated for session ${sessionId}.`
                );
              });

              newSocket.on("SESSION_UPDATE", (updatedState: SessionState) => {
                console.log(
                  `PlayPage: Received SESSION_UPDATE for ${sessionId}:`,
                  updatedState
                );
                if (isMounted) {
                  // Check mount status before setting state
                  setSessionState(updatedState);
                  setCurrentTurnIndex(updatedState.history.length - 1);
                  setError(null); // Clear error on successful update
                  setIsGameLoading(false); // Ensure loading indicator stops on update
                }
              });

              newSocket.on("player_left", (leavingUserId: string) => {
                console.log(
                  `PlayPage: Received player_left event for user ${leavingUserId}`
                );
                if (isMounted) {
                  setSessionState((prevState) => {
                    if (!prevState) return null;
                    const leavingPlayer = prevState.players.find(
                      (p) => p.userId === leavingUserId
                    );
                    // Show toast notification
                    if (leavingPlayer) {
                      toast(
                        `${
                          leavingPlayer.characterName || "A player"
                        } left the game.`,
                        { icon: "👋" }
                      );
                    }
                    // Return new state with player removed
                    return {
                      ...prevState,
                      players: prevState.players.filter(
                        (p) => p.userId !== leavingUserId
                      ),
                      // TODO: Potentially adjust currentPlayerIndex if the leaving player was the current one
                      // or if their index affects the current player's index.
                      // This depends on how the backend handles turn skipping on disconnect (not yet implemented).
                    };
                  });
                }
              });

              newSocket.on("auth_error", (error) => {
                console.error(
                  `PlayPage: WebSocket authentication error: ${error.message}`
                );
                setError(
                  `WebSocket connection failed: ${error.message}. Try refreshing.`
                );
                setConnectionStatus("disconnected"); // Auth error means disconnect
                socketRef.current?.disconnect();
              });

              newSocket.on("disconnect", (reason) => {
                console.log(
                  `PlayPage: WebSocket disconnected. Reason: ${reason}`
                );
                if (
                  isMounted &&
                  reason !== "io server disconnect" &&
                  reason !== "io client disconnect"
                ) {
                  // If disconnect wasn't manual or server-initiated auth error, it's likely trying to reconnect
                  setConnectionStatus("reconnecting");
                } else {
                  // If it was a manual disconnect or auth error, stay disconnected
                  setConnectionStatus("disconnected");
                }
              });

              newSocket.on("connect_error", (error) => {
                console.error(
                  `PlayPage: WebSocket connection error: ${error.message}`
                );
                setConnectionStatus("reconnecting"); // Assume it will retry
                // Don't set global error immediately, let reconnection attempts happen
                // if (isMounted) {
                //    setError('Could not connect to the game server. Retrying...');
                // }
              });

              // Reconnection listeners
              newSocket.io.on("reconnect_attempt", (attempt) => {
                console.log(`WS: Reconnect attempt ${attempt}`);
                if (isMounted) setConnectionStatus("reconnecting");
              });

              newSocket.io.on("reconnect", (attempt) => {
                console.log(
                  `WS: Reconnected successfully after ${attempt} attempts`
                );
                // Status will be set to 'connected' by the 'connect' event handler
                // We might not need to explicitly set it here unless connect doesn't fire on reconnect
                // if (isMounted) setConnectionStatus('connected');
              });

              newSocket.io.on("reconnect_error", (error) => {
                console.error("WS: Reconnect error:", error.message);
                // Stay in 'reconnecting' state while attempts continue
                if (isMounted) setConnectionStatus("reconnecting");
              });

              newSocket.io.on("reconnect_failed", () => {
                console.error(
                  "WS: Reconnection failed permanently after attempts."
                );
                if (isMounted) {
                  setConnectionStatus("disconnected");
                  setError("Connection lost. Please refresh the page.");
                }
              });
            }
            // --- End WebSocket Init ---
          } else {
            // This block should only run if historyLength is 0
            console.warn(
              `PlayPage WARN: Session ${sessionId} history length is NOT > 0. Setting error.`
            );
            setError("Game data seems corrupted or incomplete.");
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("PlayPage: Failed to load session", err);
          const errorMsg = `Failed to load game session: ${
            err.response?.data?.error || err.message || "Unknown error"
          }`;
          setError(errorMsg);
          if (err.response?.status === 401 || err.response?.status === 403) {
            logout();
          }
        }
      } finally {
        if (isMounted) setIsHistoryLoading(false);
      }
    };

    loadGameAndConnect();

    // Cleanup function
    return () => {
      isMounted = false;
      if (socketRef.current) {
        console.log(
          `PlayPage: Disconnecting WebSocket on unmount for session ${sessionId}`
        );
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [
    sessionId,
    isAuthenticated,
    idToken,
    user,
    navigate,
    setIsHistoryLoading,
    setError,
    logout,
    didShowInviteToast,
  ]); // Use idToken in dependency array

  // --- Action Submission Handler --- (Keep local loading for immediate feedback)
  const handleActionSubmit = useCallback(
    async (action: string) => {
      // Modify the condition to only check connectionStatus for multiplayer
      const isConnected = connectionStatus === "connected";

      if (
        combinedLoading ||
        !sessionId ||
        !isAuthenticated ||
        !sessionState ||
        (isMultiplayerGame && !isConnected)
      ) {
        if (isMultiplayerGame && !isConnected) {
          // Show error only if MP and not connected
          setError("Not connected to server. Cannot submit action.");
        }
        // Optionally log other reasons if needed for debugging
        // else { console.log("Action blocked by other loading/state issue."); }
        return;
      }

      // Use isMultiplayerGame defined in outer scope
      if (isMultiplayerGame) {
        // ... turn check logic ...
      }

      setIsGameLoading(true);
      setError(null);
      const actionFromTurnIndex = currentTurnIndex;
      try {
        console.log(
          "PlayPage: Action submitted.",
          isMultiplayerGame
            ? "Waiting for WebSocket update."
            : "Updating local state."
        );
        // Use isMultiplayerGame defined in outer scope
        if (!isMultiplayerGame) {
          const response = await submitAction(
            sessionId!,
            action,
            actionFromTurnIndex
          );
          setSessionState(response);
          setCurrentTurnIndex(response.history.length - 1);
          setIsGameLoading(false); // Stop loading for SP
        }
        // For multiplayer, the SESSION_UPDATE listener handles state update and loading stop
      } catch (err: any) {
        setError(
          `Failed to process action: ${
            err.response?.data?.error || err.message || "Unknown error"
          }`
        );
        setIsGameLoading(false); // Stop loading on error
        if (err.response?.status === 401 || err.response?.status === 403)
          logout();
      }
      // Loading state is now handled within the try block for SP or by WS for MP
    },
    [
      sessionId,
      currentTurnIndex,
      combinedLoading,
      setIsGameLoading,
      setError,
      logout,
      isAuthenticated,
      sessionState, // sessionState includes isMultiplayer indirectly
      user?.id,
      connectionStatus,
      isMultiplayerGame, // Use the flag from outer scope here
    ]
  );

  // --- History Navigation Handler ---
  const handleHistoryClick = useCallback(
    (index: number) => {
      // Prevent navigation if loading OR if it's a multiplayer game (viewing history is complex)
      // TODO: Decide if history viewing should be allowed in multiplayer.
      // For now, disable it in multiplayer.
      if (!combinedLoading && !sessionState?.isMultiplayer) {
        setCurrentTurnIndex(index);
      }
    },
    [combinedLoading, sessionState?.isMultiplayer] // Dependency
  );

  // --- Return to Selection Handler --- (No change needed)
  const handleReturnToSelection = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // --- Determine Current Turn Data ---
  const currentTurn = sessionState?.history[currentTurnIndex] || null;
  // const characterImageUrl = sessionState?.players?.find(
  //   (p) => p.userId === user?.id
  // )?.characterImageUrl; // Get current user's image if needed

  // --- Connection Status Indicator Component ---
  const ConnectionIndicator = () => {
    let bgColor = "bg-gray-400";
    let textColor = "text-gray-700";
    let Icon = ExclamationCircleIcon; // Default to error/disconnected style
    let text = connectionStatus.toUpperCase();

    switch (connectionStatus) {
      case "connected":
        bgColor = "bg-green-100 dark:bg-green-900";
        textColor = "text-green-700 dark:text-green-200";
        Icon = WifiIcon;
        text = "Connected";
        break;
      case "connecting":
      case "reconnecting":
        bgColor = "bg-yellow-100 dark:bg-yellow-900";
        textColor = "text-yellow-700 dark:text-yellow-200";
        Icon = ArrowPathIcon;
        text =
          connectionStatus === "connecting"
            ? "Connecting..."
            : "Reconnecting...";
        break;
      case "disconnected":
      case "idle":
        bgColor = "bg-red-100 dark:bg-red-900";
        textColor = "text-red-700 dark:text-red-200";
        Icon = ExclamationCircleIcon;
        text = "Disconnected";
        break;
    }

    if (connectionStatus === "idle") return null; // Don't show if idle (before load)

    return (
      <div
        className={`fixed bottom-4 right-4 z-50 px-3 py-1.5 rounded-full shadow-md text-xs font-medium flex items-center gap-1.5 ${bgColor} ${textColor}`}
      >
        <Icon className="h-4 w-4" />
        <span>{text}</span>
      </div>
    );
  };

  // --- Render Logic ---

  // 1. Initial Loading State (Show if history loading and no session state yet)
  if (isGlobalHistoryLoading && !sessionState && !currentError) {
    return (
      <div className="text-center mt-12 text-xl text-gray-500 dark:text-gray-400">
        Loading Adventure...
      </div>
    );
  }

  // 2. Invalid State (No session data, and no loading operation is active)
  if (!sessionState && !combinedLoading) {
    if (currentError) return null;
    return (
      <div className="text-center mt-12 text-gray-500 dark:text-gray-400">
        Could not load game data or session is invalid.{" "}
        <button
          onClick={handleReturnToSelection}
          className="text-blue-500 hover:underline"
        >
          Return to selection?
        </button>
      </div>
    );
  }

  // 3. Render Game Interface (Ensure sessionState and currentTurn exist)
  return (
    <div>
      {/* Render Connection Indicator */}
      <ConnectionIndicator />

      {sessionState && currentTurn && !currentError && (
        <GameInterface
          currentTurn={currentTurn}
          history={sessionState.history} // Pass full history
          currentTurnIndex={currentTurnIndex}
          isLoading={gameInterfaceLoading} // Pass specific loading state
          onActionSubmit={handleActionSubmit}
          onHistoryClick={handleHistoryClick}
          // --- NEW Props for Multiplayer ---
          isMultiplayer={sessionState.isMultiplayer}
          players={sessionState.players}
          currentPlayerIndex={sessionState.currentPlayerIndex}
          currentUserId={user?.id} // Pass current user's ID
        />
      )}
    </div>
  );
};

export default PlayPage;
