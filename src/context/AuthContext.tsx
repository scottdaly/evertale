// src/context/AuthContext.tsx
import {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import { jwtDecode } from "jwt-decode"; // Optional: for inspecting token data

interface User {
  id: string; // Google User ID (sub)
  email: string;
  name: string;
  // Add picture if needed: picture?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  idToken: string | null;
  isLoading: boolean; // Auth-specific loading (optional)
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to get token/user from storage (if you decide to persist)
const getStoredAuth = (): { token: string | null; user: User | null } => {
  const token = localStorage.getItem("idToken");
  const userStr = localStorage.getItem("user");
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      // Optional: Add basic expiry check here if desired, but backend MUST verify
      return { token, user };
    } catch (e) {
      // Invalid data in storage
    }
  }
  return { token: null, user: null };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading until checked

  // Check storage on initial load
  useEffect(() => {
    const { token: storedToken, user: storedUser } = getStoredAuth();
    if (storedToken && storedUser) {
      // Basic check - Ideally verify with backend or check expiry more robustly
      // For simplicity, we just load it. Backend will reject if invalid.
      console.log("AuthProvider: Found stored auth, attempting to use.");
      setIdToken(storedToken);
      setUser(storedUser);
    }
    setIsLoading(false); // Finished initial check
  }, []);

  const login = useCallback((token: string) => {
    try {
      const decoded: {
        sub: string;
        email: string;
        name: string /* picture?: string */;
      } = jwtDecode(token);
      const currentUser: User = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        // picture: decoded.picture
      };
      setIdToken(token);
      setUser(currentUser);
      localStorage.setItem("idToken", token); // Persist token
      localStorage.setItem("user", JSON.stringify(currentUser)); // Persist basic user info
      console.log("AuthProvider: Logged in:", currentUser.email);
    } catch (error) {
      console.error("AuthProvider: Error decoding token during login:", error);
      // Handle invalid token scenario if needed
      logout(); // Clear any potentially bad state
    }
  }, []);

  const logout = useCallback(() => {
    setIdToken(null);
    setUser(null);
    localStorage.removeItem("idToken");
    localStorage.removeItem("user");
    // Optionally clear other app state related to the user
    console.log("AuthProvider: Logged out.");
  }, []);

  const isAuthenticated = !!idToken && !!user;

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, user, idToken, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
