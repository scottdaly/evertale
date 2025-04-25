// src/App.tsx
import { useState, useEffect, useCallback } from "react";
import {
  Routes,
  Route,
  useNavigate,
  useParams,
  Navigate,
  useLocation,
} from "react-router-dom";
import { googleLogout } from "@react-oauth/google";
import { useAuth } from "./context/AuthContext";
import CharacterCreation from "./components/CharacterCreation";
import { startGame, joinGame, getInviteInfo } from "./services/api";
import type {
  JoinGamePayload,
  StartGamePayload,
  StartGameResponse,
  InviteInfoResponse,
} from "./types";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import PlayPage from "./pages/PlayPage";
import { Toaster } from "react-hot-toast";

type Theme = "light" | "dark";

// Helper function to get theme parameter safely
const useThemeParam = () => {
  const { theme: themeParam } = useParams<{ theme: string }>();
  return themeParam ? decodeURIComponent(themeParam) : null;
};

// --- NEW: Helper function to get invite code parameter safely ---
const useInviteCodeParam = () => {
  const { inviteCode: codeParam } = useParams<{ inviteCode: string }>();
  return codeParam ? decodeURIComponent(codeParam) : null;
};
// --------------------------------------------------------------

function App() {
  const {
    isAuthenticated,
    user,
    login,
    logout,
    isLoading: isAuthLoading,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // --- THEME STATE ---
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem("theme") as Theme | null;
    if (storedTheme) return storedTheme;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches)
      return "dark";
    return "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleThemeToggle = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  }, []);
  // --- END THEME STATE ---

  // --- CORE APP STATE (Error, Loadings) ---
  const [error, setError] = useState<string | null>(null);
  const [isGameLoading, setIsGameLoading] = useState<boolean>(false); // For start game / submit action
  const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false); // For history list / load session
  const [isDeletingSession, setIsDeletingSession] = useState<boolean>(false); // For delete operation
  const [isJoiningGame, setIsJoiningGame] = useState<boolean>(false); // NEW loading state for join

  // --- Combined Loading State ---
  const combinedLoading =
    isAuthLoading ||
    isGameLoading ||
    isHistoryLoading ||
    isDeletingSession ||
    isJoiningGame; // Add isJoiningGame

  // --- Auth Handling ---
  const handleLoginSuccess = (credentialResponse: any) => {
    console.log("Google Login Success:", credentialResponse);
    if (credentialResponse.credential) {
      login(credentialResponse.credential);
      setError(null);
      navigate("/");
    } else {
      setError("Login failed: No credential received from Google.");
    }
  };

  const handleLoginError = () => {
    console.error("Google Login Failed");
    setError("Google login failed. Please try again.");
  };

  const handleLogoutClick = () => {
    googleLogout();
    logout();
    setError(null);
    navigate("/");
  };

  // Effect to clear error on route change
  useEffect(() => {
    setError(null);
  }, [location.key]);

  // --- App Structure ---
  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <Toaster
        position="top-center"
        reverseOrder={false}
        toastOptions={{
          className: "dark:bg-gray-700 dark:text-white",
          duration: 5000,
        }}
      />
      <Header
        isAuthLoading={isAuthLoading}
        isAuthenticated={isAuthenticated}
        handleLogoutClick={handleLogoutClick}
        handleLoginSuccess={handleLoginSuccess}
        handleLoginError={handleLoginError}
        user={user}
        currentTheme={theme}
        onThemeToggle={handleThemeToggle}
      />

      {/* Error Display */}
      {error && (
        <div className="error-display w-full max-w-3xl mt-4 mb-6 p-4 border border-red-600 bg-red-100 dark:bg-red-900/[0.3] text-red-800 dark:text-red-200 rounded-lg">
          <p>
            <strong className="font-semibold">Error:</strong> {error}
          </p>
          <button
            onClick={() => setError(null)}
            className="mt-2 px-3 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600"
          >
            Dismiss Error
          </button>
          <button
            onClick={() => {
              setError(null);
              navigate("/");
            }}
            className="mt-2 ml-2 px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
          >
            Go Home
          </button>
        </div>
      )}

      {/* --- Main Content Area with Routes --- */}
      <div className="w-full max-w-6xl mt-6 px-4">
        {isAuthenticated ? (
          <Routes>
            <Route
              path="/"
              element={
                <HomePage
                  setError={setError}
                  setIsHistoryLoading={setIsHistoryLoading}
                  setIsDeletingSession={setIsDeletingSession}
                  combinedLoading={combinedLoading}
                  logout={logout}
                />
              }
            />
            <Route
              path="/create/:theme"
              element={
                <CreatePage
                  setError={setError}
                  setIsGameLoading={setIsGameLoading}
                  setIsHistoryLoading={setIsHistoryLoading}
                  setIsDeletingSession={setIsDeletingSession}
                  setIsJoiningGame={setIsJoiningGame}
                  combinedLoading={combinedLoading}
                  logout={logout}
                />
              }
            />
            <Route
              path="/join/:inviteCode"
              element={
                <JoinPage
                  setError={setError}
                  setIsJoiningGame={setIsJoiningGame}
                  combinedLoading={combinedLoading}
                  logout={logout}
                />
              }
            />
            <Route
              path="/play/:sessionId"
              element={
                <PlayPage
                  setError={setError}
                  setIsGameLoading={setIsGameLoading}
                  setIsHistoryLoading={setIsHistoryLoading}
                  isGlobalAuthLoading={isAuthLoading}
                  isGlobalGameLoading={isGameLoading}
                  isGlobalHistoryLoading={isHistoryLoading}
                  isGlobalDeletingSession={isDeletingSession}
                  logout={logout}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route
              path="*"
              element={
                <p className="mt-12 text-center text-gray-600 dark:text-gray-400">
                  Log in to begin your adventure!
                </p>
              }
            />
          </Routes>
        )}
      </div>
    </div>
  );
}

// ==============================================
// Route Components
// ==============================================

interface RouteComponentProps {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsGameLoading?: React.Dispatch<React.SetStateAction<boolean>>;
  setIsHistoryLoading?: React.Dispatch<React.SetStateAction<boolean>>;
  setIsDeletingSession?: React.Dispatch<React.SetStateAction<boolean>>;
  setIsJoiningGame?: React.Dispatch<React.SetStateAction<boolean>>;
  combinedLoading: boolean;
  logout: () => void;
}

// --- CreatePage Component ---
const CreatePage = ({
  setError,
  setIsGameLoading,
  setIsHistoryLoading: _setIsHistoryLoading,
  combinedLoading,
  logout,
}: RouteComponentProps & {
  setIsGameLoading: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useThemeParam();
  const isMultiplayer = location.state?.isMultiplayer || false;

  const handleCharacterCreated = useCallback(
    async (characterData: {
      name: string;
      gender: string;
      imageUrl?: string | null;
    }) => {
      if (combinedLoading || !theme || !setIsGameLoading) {
        if (!theme) setError("Theme is missing.");
        if (!setIsGameLoading)
          setError("Internal error: Loading handler missing.");
        if (!theme) navigate("/");
        return;
      }
      setIsGameLoading(true);
      setError(null);
      try {
        const payload: StartGamePayload = {
          theme: theme!,
          characterName: characterData.name,
          characterGender: characterData.gender,
          characterImageUrl: characterData.imageUrl,
          isMultiplayer: isMultiplayer,
        };
        const response: StartGameResponse = await startGame(payload);

        if (isMultiplayer && response.inviteCode) {
          console.log(
            `Multiplayer Game Started! Invite Code: ${response.inviteCode}`
          );
          sessionStorage.setItem(
            `inviteCode_${response.sessionId}`,
            response.inviteCode
          );
        }

        navigate(`/play/${encodeURIComponent(response.sessionId)}`, {
          replace: true,
        });
      } catch (err: any) {
        setError(
          `Failed to start game: ${
            err.response?.data?.error || err.message || "Unknown error"
          }`
        );
        if (err.response?.status === 401 || err.response?.status === 403)
          logout();
      } finally {
        setIsGameLoading(false);
      }
    },
    [
      theme,
      navigate,
      setError,
      setIsGameLoading,
      logout,
      combinedLoading,
      isMultiplayer,
    ]
  );

  const handleCancelCharacterCreation = useCallback(() => {
    navigate("/");
  }, [navigate]);

  if (!theme) {
    console.warn("Theme parameter missing in /create route. Redirecting home.");
    return <Navigate to="/" replace />;
  }

  return (
    <CharacterCreation
      theme={theme}
      onCharacterCreated={handleCharacterCreated}
      onCancel={handleCancelCharacterCreation}
      isLoading={combinedLoading}
      mode={isMultiplayer ? "create-multiplayer" : "create-singleplayer"}
    />
  );
};

// --- JoinPage Component (NEW) --- (Handles Joining via Invite Code)
const JoinPage = ({
  setError,
  setIsJoiningGame,
  combinedLoading: globalLoading,
  logout,
}: RouteComponentProps & {
  setIsJoiningGame: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const navigate = useNavigate();
  const inviteCode = useInviteCodeParam();

  // State for fetching invite info
  const [inviteInfo, setInviteInfo] = useState<InviteInfoResponse | null>(null);
  const [isFetchingInvite, setIsFetchingInvite] = useState<boolean>(true);
  const [joinError, setJoinError] = useState<string | null>(null); // Local error state

  // Combined loading for this specific page
  const currentPageLoading = globalLoading || isFetchingInvite;

  // Effect to fetch invite info
  useEffect(() => {
    if (!inviteCode) {
      navigate("/"); // Redirect if no code
      return;
    }
    let isMounted = true;
    const fetchInfo = async () => {
      console.log(`JoinPage: Fetching info for invite code ${inviteCode}`);
      setIsFetchingInvite(true);
      setJoinError(null);
      setError(null); // Clear global error too
      try {
        const data = await getInviteInfo(inviteCode);
        if (isMounted) {
          if (data.isFull) {
            setJoinError("This game session is already full.");
            setInviteInfo(null); // Don't store full session info
          } else {
            setInviteInfo(data);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("JoinPage: Failed to fetch invite info", err);
          const errorMsg =
            err.response?.data?.error ||
            err.message ||
            "Invalid invite code or failed to load session info.";
          setJoinError(errorMsg);
        }
      } finally {
        if (isMounted) setIsFetchingInvite(false);
      }
    };
    fetchInfo();
    return () => {
      isMounted = false;
    };
  }, [inviteCode, navigate, setError]); // Add setError dependency

  // Handler for when character is created (triggers final join)
  const handleCharacterCreatedAndJoin = useCallback(
    async (characterData: {
      name: string;
      gender: string;
      imageUrl?: string | null;
    }) => {
      if (globalLoading || isFetchingInvite || !inviteCode || !setIsJoiningGame)
        return;

      setIsJoiningGame(true);
      setJoinError(null); // Clear local error before attempting join
      setError(null); // Clear global error
      try {
        const payload: JoinGamePayload = {
          inviteCode: inviteCode,
          characterName: characterData.name,
          characterGender: characterData.gender,
          characterImageUrl: characterData.imageUrl,
        };
        const response = await joinGame(payload);
        navigate(`/play/${encodeURIComponent(response.sessionId)}`, {
          replace: true,
        });
      } catch (err: any) {
        // Handle final join error
        const errorMsg = `Failed to join game: ${
          err.response?.data?.error || err.message || "Unknown error"
        }`;
        setJoinError(errorMsg); // Set local error for display
        setError(null); // Keep global error clear unless it's auth-related
        if (err.response?.status === 401 || err.response?.status === 403)
          logout();
      } finally {
        setIsJoiningGame(false);
      }
    },
    [
      inviteCode,
      navigate,
      setError,
      setIsJoiningGame,
      logout,
      globalLoading,
      isFetchingInvite,
    ]
  );

  const handleCancelJoin = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // --- Render Logic ---

  // 1. Show loading while fetching invite info
  if (isFetchingInvite) {
    return (
      <div className="text-center mt-12 text-xl text-gray-500 dark:text-gray-400">
        Verifying Invite Code...
      </div>
    );
  }

  // 2. Show error if invite fetch failed or session is full
  if (joinError) {
    return (
      <div className="text-center mt-12 text-gray-800 dark:text-gray-200 max-w-md mx-auto">
        <p className="text-xl font-semibold text-red-600 dark:text-red-400 mb-4">
          Error
        </p>
        <p className="mb-6">{joinError}</p>
        <button
          onClick={handleCancelJoin}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
        >
          Return Home
        </button>
      </div>
    );
  }

  // 3. Render Character Creation if invite info is valid
  if (inviteInfo) {
    return (
      <CharacterCreation
        theme={inviteInfo.theme} // Pass fetched theme
        onCharacterCreated={handleCharacterCreatedAndJoin}
        onCancel={handleCancelJoin}
        isLoading={currentPageLoading} // Pass combined loading state
        mode={"join-multiplayer"}
        inviteCode={inviteCode!} // Pass invite code (we know it exists here)
      />
    );
  }

  // Fallback (shouldn't be reached ideally)
  return <Navigate to="/" replace />;
};

export default App;
