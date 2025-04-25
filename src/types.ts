// src/types.ts

// --- NEW: Character Type from LLM JSON ---
export interface Character {
  name: string;
  description: string;
  appearance: string;
  opinionOfPlayer: string;
}

export interface Turn {
  turnIndex: number;
  scenarioText: string;
  imageUrl: string; // URL received from backend
  imagePrompt: string; // The prompt used to generate the image
  suggestedActions: string[];
  actionTaken: string | null; // Action that led to this turn
  // New fields from LLM
  timeOfDay: string;
  isSameLocation: boolean;
  characters: Character[]; // Array of characters in the scene
  actingPlayerUserId?: string | null;
  actingPlayerIndex?: number | null;
  // Optional character image URL (already present in SessionHistoryResponse, maybe not needed here?)
  characterImageUrl?: string | null;
}

export interface GameStartResponse {
  sessionId: string;
  currentTurn: Turn;
}

export interface GameActionResponse {
  currentTurn: Turn;
  updatedHistory: Turn[]; // Backend sends the full history on action
}

// Possible states for the game UI
export type GameState =
  | "selectingTheme"
  | "creatingCharacter"
  | "loading"
  | "playing"
  | "error";

// --- NEW Types for History Feature ---

// Summary of a past session for the list view
export interface SessionSummary {
  session_id: string;
  theme: string;
  created_at: string; // ISO date string
  last_updated_at: string; // ISO date string
  initial_scenario_snippet: string;
}

// NEW: Describes a player within a session
export interface Player {
  userId: string;
  playerIndex: number;
  characterName: string;
  characterGender: string;
  characterImageUrl?: string | null;
}

// Describes the response when fetching the list of past sessions
export interface SessionListItem {
  session_id: string;
  theme: string;
  created_at: string;
  last_updated_at: string;
  initial_scenario_snippet: string;
  isMultiplayer: boolean;
  playerCount: number;
}

// Describes the data structure for the main game state,
// used for both initial load response and WebSocket updates.
export interface SessionState {
  sessionId: string;
  theme: string;
  isMultiplayer: boolean;
  currentPlayerIndex: number | null;
  players: Player[];
  history: Turn[];
}

// --- API Request Payloads ---

// Payload for starting a game (/api/game/start)
export interface StartGamePayload {
  theme: string;
  characterName: string;
  characterGender: string;
  characterImageUrl?: string | null;
  isMultiplayer?: boolean;
  maxPlayers?: number;
}

// Payload for joining a game (/api/game/join)
export interface JoinGamePayload {
  inviteCode: string;
  characterName: string;
  characterGender: string;
  characterImageUrl?: string | null;
}

// Payload for submitting an action (/api/game/action)
export interface SubmitActionPayload {
  sessionId: string;
  action: string;
  turnIndex: number;
}

// Payload for generating a character image (/api/images/generate/character)
export interface GenerateImagePayload {
  theme: string;
  characterName: string;
  characterGender: string;
  characterDescription?: string;
}

// --- API Response Payloads ---

// Response from starting a game (/api/game/start)
// Note: The initial turn data is now part of the SessionState structure
export interface StartGameResponse {
  sessionId: string;
  inviteCode?: string;
}

// Response from joining a game (/api/game/join)
export interface JoinGameResponse {
  sessionId: string;
  message?: string;
}

// Response from submitting an action (/api/game/action)
// This now returns the full SessionState
export type SubmitActionResponse = SessionState;

// Response from getting specific session history (/api/games/history/:sessionId)
// This also returns the full SessionState
export type SessionHistoryResponse = SessionState;

// Response from uploading an image (/api/images/upload/character)
export interface UploadImageResponse {
  imageUrl: string;
}

// Response from generating an image (/api/images/generate/character)
export interface GenerateImageResponse {
  imageUrl: string;
}

// --- NEW: Response from checking an invite code (/api/invite/:inviteCode) ---
export interface InviteInfoResponse {
  sessionId: string;
  theme: string;
  isFull: boolean;
  playerCount: number;
  maxPlayers: number;
}

// Type for the authenticated user object from useAuth context
export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}
