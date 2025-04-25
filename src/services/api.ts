// src/services/api.ts
import axios from "axios";
// Remove useAuth import if not needed elsewhere after this change
// import { useAuth } from "../context/AuthContext";
import type {
  GameStartResponse,
  GameActionResponse,
  Turn,
  SessionSummary,
  SessionHistoryResponse,
  SessionListItem,
  SessionState,
  GenerateImagePayload,
  JoinGamePayload,
  JoinGameResponse,
  InviteInfoResponse,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

if (!API_BASE_URL) {
  console.error("FATAL ERROR: VITE_API_BASE_URL is not defined in .env");
  // You might want to throw an error or handle this differently
}

// --- Create Singleton Axios Instance --- \
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// --- Add Request Interceptor to Inject Token from localStorage --- \
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("idToken"); // Read directly from storage
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
      // console.log("Token added to request:", config.url);
    } else {
      // console.warn("No token found in localStorage. Authorization header not set.");
    }
    return config;
  },
  (error) => {
    console.error("Error setting auth token in request interceptor:", error);
    return Promise.reject(error);
  }
);

// Optional: Add response interceptor for global error handling (like 401/403)
// You might want to enhance this later to coordinate with AuthContext for logout
apiClient.interceptors.response.use(
  (response) => response, // Simply return successful responses
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      console.error(`API Error ${status} for ${error.config.url}:`, data);

      // Example: Basic handling for expired/invalid token
      if (status === 401 || status === 403) {
        console.warn(
          "API Interceptor: Received 401/403. Token might be invalid/expired."
        );
        // Currently, App.tsx catches errors from API calls and handles logout there.
        // This interceptor just logs the issue for now.
      }
    } else if (error.request) {
      console.error("API Network Error:", error.message);
    } else {
      console.error("API Request Setup Error:", error.message);
    }
    return Promise.reject(error); // Propagate the error
  }
);

// --- API Call Functions (No changes needed below this line for auth injection) --- \

// Payload for starting a new game
interface StartGamePayload {
  theme: string;
  characterName: string;
  characterGender: string;
  characterImageUrl?: string | null; // Add optional image URL
}

// Response from starting a new game
interface StartGameResponse {
  sessionId: string;
  currentTurn: Turn;
}

// Function to start a new game
export const startGame = async (
  payload: StartGamePayload
): Promise<StartGameResponse> => {
  // No need to call useApiClient anymore
  console.log("Starting game with payload:", payload);
  const response = await apiClient.post<StartGameResponse>(
    "/game/start",
    payload
  );
  return response.data;
};

// Payload for submitting an action
interface SubmitActionPayload {
  sessionId: string;
  action: string;
  turnIndex: number;
}

// Response from submitting an action
interface SubmitActionResponse {
  currentTurn: Turn;
  updatedHistory: Turn[];
}

// Function to submit an action
export const submitAction = async (
  sessionId: string,
  action: string,
  turnIndex: number
): Promise<SessionState> => {
  // No need to call useApiClient anymore
  const payload: SubmitActionPayload = { sessionId, action, turnIndex };
  const response = await apiClient.post<SessionState>("/game/action", payload);
  return response.data;
};

// Function to get the list of game sessions
export const getGameHistoryList = async (): Promise<SessionListItem[]> => {
  // No need to call useApiClient anymore
  const response = await apiClient.get<SessionListItem[]>("/games/history");
  return response.data;
};

// Function to get the full history of a specific session
export const getSessionHistory = async (
  sessionId: string
): Promise<SessionState> => {
  // No need to call useApiClient anymore
  const response = await apiClient.get<SessionState>(
    `/games/history/${encodeURIComponent(sessionId)}`
  );
  return response.data;
};

// Function to delete a game session
export const deleteSession = async (sessionId: string): Promise<void> => {
  // No need to call useApiClient anymore
  await apiClient.delete(`/games/history/${encodeURIComponent(sessionId)}`);
};

// --- NEW: Character Image Upload Function ---
interface UploadImageResponse {
  imageUrl: string; // The URL path returned by the backend
}

export const uploadCharacterImage = async (
  file: File
): Promise<UploadImageResponse> => {
  const formData = new FormData();
  formData.append("characterImage", file); // Field name must match multer config

  console.log("Uploading character image:", file.name);

  // Make sure to set Content-Type to multipart/form-data
  const response = await apiClient.post<UploadImageResponse>(
    "/images/upload/character",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      // Optional: Add upload progress handler here if needed
      // onUploadProgress: progressEvent => { ... }
    }
  );
  console.log("Upload response:", response.data);
  return response.data;
};

// --- NEW: Character Image Generation Function ---
interface GenerateCharacterImagePayload {
  theme: string;
  characterName: string;
  characterGender: string;
  characterDescription?: string | null; // Add optional description
}

// Response type is the same as upload (contains imageUrl)
interface GenerateImageResponse {
  imageUrl: string;
}

export const generateCharacterImage = async (
  payload: GenerateCharacterImagePayload
): Promise<GenerateImageResponse> => {
  console.log(
    "Requesting AI character image generation with payload:",
    payload
  );
  // Payload now includes description, no change needed here as payload is passed directly
  const response = await apiClient.post<GenerateImageResponse>(
    "/images/generate/character",
    payload
  );
  console.log("Generation response:", response.data);
  // The imageUrl here will likely be a base64 data URI from Imagen
  return response.data;
};

// Join a multiplayer game (NEW)
export const joinGame = async (
  payload: JoinGamePayload
): Promise<JoinGameResponse> => {
  const response = await apiClient.post<JoinGameResponse>(
    "/game/join",
    payload
  );
  // Returns { sessionId, message? }
  return response.data;
};

// NEW: Get Session Info via Invite Code
export const getInviteInfo = async (
  inviteCode: string
): Promise<InviteInfoResponse> => {
  const response = await apiClient.get<InviteInfoResponse>(
    `/invite/${inviteCode}`
  );
  return response.data;
};

// Add other API calls if needed (e.g., get game state)
