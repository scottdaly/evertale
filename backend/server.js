import express from "express";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { OAuth2Client } from "google-auth-library";
import multer from "multer";
import path, { dirname } from "path";
import fs from "fs";
import { GoogleGenAI, Modality } from "@google/genai";
import { fileURLToPath } from "url";
import OpenAI from "openai";

// --- NEW: WebSocket Imports ---
import http from "http";
import { Server as SocketIOServer } from "socket.io";
// -----------------------------

dotenv.config();

// --- ES Module equivalent for __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ---------------------------------------

const app = express();
const port = process.env.PORT || 3001;

// --- NEW: Create HTTP Server and Socket.IO Server ---
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: uniqueAllowedOrigins, // Use the array of allowed origins
    methods: ["GET", "POST"],
    credentials: true,
  },
});
// ---------------------------------------------------

// --- Create Upload Directory ---
const UPLOAD_DIR = path.join(__dirname, "uploads", "character_images");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`Created upload directory: ${UPLOAD_DIR}`);
}

// --- Database Setup  ---
const DB_PATH = process.env.SQLITE_DB_PATH || "./ai_adventure.db";
let db;

async function initializeDatabase() {
  try {
    console.log(`Opening database connection to: ${DB_PATH}`);
    const dbInstance = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });
    await dbInstance.run("PRAGMA foreign_keys = ON;");

    // --- Create users table (if not exists) ---
    // Added IF NOT EXISTS for robustness
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME
      );
    `);
    console.log("Users table checked/created.");

    // --- Create sessions table (if not exists) ---
    // Added IF NOT EXISTS for robustness
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL, -- Consider removing if solely relying on session_players for owner info
        theme TEXT NOT NULL,
        character_name TEXT, -- Kept for potential single-player use or migration ease
        character_gender TEXT, -- Kept for potential single-player use or migration ease
        character_image_url TEXT, -- Kept for potential single-player use or migration ease
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated_at DATETIME,
        is_multiplayer INTEGER DEFAULT 0, -- NEW: Flag for multiplayer games
        max_players INTEGER,               -- NEW: Max players for multiplayer
        current_player_index INTEGER,      -- NEW: Index of the current player (links to session_players.player_index)
        invite_code TEXT UNIQUE,           -- NEW: Unique code for joining multiplayer games
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      );
    `);
    console.log("Sessions table checked/created.");

    // --- Create turns table (if not exists) ---
    // Added IF NOT EXISTS for robustness
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        turn_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn_index INTEGER NOT NULL,
        scenario_text TEXT,
        image_url TEXT,
        image_prompt TEXT,
        suggested_actions TEXT, -- Stored as JSON string
        action_taken TEXT,
        time_of_day TEXT,
        is_same_location INTEGER, -- Boolean (0 or 1)
        characters TEXT,         -- Stored as JSON string [{name, description, appearance, opinionOfPlayer}]
        acting_player_user_id TEXT, -- NEW: User ID of the player who took the action leading to this turn
        acting_player_index INTEGER,   -- NEW: Player index of the user who took the action
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (acting_player_user_id) REFERENCES users(user_id), -- Optional: Link action taker
        UNIQUE(session_id, turn_index)
      );
    `);
    console.log("Turns table checked/created.");

    // --- NEW: Create session_players table (if not exists) ---
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS session_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- Simple row ID
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        player_index INTEGER NOT NULL, -- 0-based turn order
        character_name TEXT NOT NULL,
        character_gender TEXT NOT NULL,
        character_image_url TEXT,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1, -- Boolean (0 or 1) for disconnected/active status
        FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(user_id),
        UNIQUE(session_id, user_id), -- User can only be in a session once
        UNIQUE(session_id, player_index) -- Turn order must be unique within a session
      );
    `);
    console.log("Session_players table checked/created.");

    // --- Add Columns using ALTER TABLE (Safer for existing data) ---
    // Use try-catch blocks to ignore "duplicate column name" errors
    console.log(
      "Attempting to add columns via ALTER TABLE if they don't exist..."
    );

    const addColumn = async (table, column, definition) => {
      try {
        await dbInstance.run(
          `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        );
        console.log(` -> Added column '${column}' to table '${table}'.`);
      } catch (err) {
        if (err.message.includes("duplicate column name")) {
          console.log(
            ` -> Column '${column}' already exists in table '${table}'.`
          );
        } else {
          console.warn(
            ` -> Warning trying to add column '${column}' to '${table}': ${err.message}`
          );
          // Optionally re-throw if it's a different critical error
          // throw err;
        }
      }
    };

    // Add to 'sessions'
    await addColumn("sessions", "is_multiplayer", "INTEGER DEFAULT 0");
    await addColumn("sessions", "max_players", "INTEGER");
    await addColumn("sessions", "current_player_index", "INTEGER");
    await addColumn("sessions", "invite_code", "TEXT UNIQUE");
    // Old character columns might already exist from previous attempts or initial creation
    await addColumn("sessions", "character_name", "TEXT");
    await addColumn("sessions", "character_gender", "TEXT");
    await addColumn("sessions", "character_image_url", "TEXT");

    // Add to 'turns'
    await addColumn("turns", "time_of_day", "TEXT");
    await addColumn("turns", "is_same_location", "INTEGER");
    await addColumn("turns", "characters", "TEXT");
    await addColumn("turns", "acting_player_user_id", "TEXT");
    await addColumn("turns", "acting_player_index", "INTEGER");

    console.log("Column addition checks complete.");
    // ----------------------------------------------

    console.log("Database connection opened successfully.");
    return dbInstance;
  } catch (error) {
    console.error("FATAL ERROR: Database connection failed.", error);
    process.exit(1); // Exit if DB connection fails initially
  }
}

// --- Google Auth Client ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  console.error(
    "FATAL ERROR: GOOGLE_CLIENT_ID environment variable is not set."
  );
  process.exit(1);
}
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// --- LLM Configuration ---
const ACTIVE_LLM_PROVIDER = process.env.ACTIVE_LLM_PROVIDER || "openai"; // Default to openai
const ACTIVE_IMAGE_PROVIDER = process.env.ACTIVE_IMAGE_PROVIDER || "google"; // Default to openai

// OpenAI Config
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_ENDPOINT =
  process.env.OPENAI_API_ENDPOINT ||
  "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Google Gemini Config
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_MODEL = process.env.GOOGLE_MODEL || "gemini-2.0-flash";

const googleGenAI = new GoogleGenAI({
  apiKey: GOOGLE_API_KEY,
});

const GOOGLE_FLASH_MODEL =
  process.env.GOOGLE_FLASH_MODEL || "gemini-2.0-flash-exp-image-generation";
// Note: Gemini endpoint includes model and key
const GOOGLE_API_ENDPOINT_TEMPLATE = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent`;
const GOOGLE_FLASH_API_ENDPOINT_TEMPLATE = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_FLASH_MODEL}:generateContent`;

// Anthropic Claude Config
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620";
const ANTHROPIC_API_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = process.env.ANTHROPIC_API_VERSION || "2023-06-01";

// --- Imagen Configuration ---
const IMAGEN_MODEL = process.env.IMAGEN_MODEL || "imagen-3.0-generate-002";
const IMAGEN_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGEN_MODEL}:predict`;
const IMAGEN_ASPECT_RATIO = process.env.IMAGEN_ASPECT_RATIO || "16:9"; // Default to 16:9

// --- Configuration Validation ---
console.log(`Using LLM Provider: ${ACTIVE_LLM_PROVIDER}`);
switch (ACTIVE_LLM_PROVIDER) {
  case "openai":
    if (!OPENAI_API_KEY)
      throw new Error(
        "FATAL ERROR: OPENAI_API_KEY is not set for the active provider."
      );
    break;
  case "google":
    if (!GOOGLE_API_KEY)
      throw new Error(
        "FATAL ERROR: GOOGLE_API_KEY is not set for the active provider."
      );
    break;
  case "anthropic":
    if (!ANTHROPIC_API_KEY)
      throw new Error(
        "FATAL ERROR: ANTHROPIC_API_KEY is not set for the active provider."
      );
    break;
  default:
    throw new Error(
      `FATAL ERROR: Unknown ACTIVE_LLM_PROVIDER: ${ACTIVE_LLM_PROVIDER}. Use 'openai', 'google', or 'anthropic'.`
    );
}

// --- Middleware  ---
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Multer Configuration ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type, only images are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// --- Authentication Middleware --- (Used for REST API, also needed for WS auth)
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  console.log(
    "Auth Middleware: Received raw Authorization header:",
    authHeader
  );
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

  if (token == null) {
    console.log("Auth Middleware: No token provided");
    return res
      .status(401)
      .json({ error: "Authentication required: No token provided." });
  }

  try {
    console.log("Auth Middleware: Verifying token...");
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID, // Specify the CLIENT_ID of the app that accesses the backend
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      console.error("Auth Middleware: Invalid token payload", payload);
      return res
        .status(401)
        .json({ error: "Authentication failed: Invalid token payload." });
    }

    const userId = payload.sub; // Google User ID
    const email = payload.email;
    const name = payload.name || ""; // Use name if available

    console.log(
      `Auth Middleware: Token verified for user ID: ${userId}, email: ${email}`
    );

    // Find or create user in DB
    // Use INSERT OR IGNORE to handle potential race conditions gracefully
    // Then UPDATE the name and last_login_at
    const insertUserSql = `
            INSERT OR IGNORE INTO users (user_id, email, name, created_at, last_login_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))`;
    await db.run(insertUserSql, [userId, email, name]);

    const updateUserSql = `
            UPDATE users
            SET name = ?, last_login_at = datetime('now')
            WHERE user_id = ?`;
    await db.run(updateUserSql, [name, userId]);

    // Attach user info to the request object for downstream handlers
    req.user = {
      id: userId,
      email: email,
      name: name,
    };
    console.log("Auth Middleware: User attached to request:", req.user.id);
    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error("Auth Middleware: Token verification failed:", error.message);
    res
      .status(403)
      .json({ error: "Authentication failed: Invalid or expired token." }); // Forbidden
  }
}

// --- Helper function to generate character portrait prompt ---
function generateCharacterPrompt(theme, name, gender, description) {
  let styleKeywords = "digital painting, detailed, character concept art";
  switch (theme?.toLowerCase()) {
    case "fantasy":
      styleKeywords =
        "fantasy art, digital painting, detailed illustration, character portrait";
      break;
    case "sci-fi":
      styleKeywords =
        "sci-fi art, futuristic, detailed concept art, character portrait";
      break;
    case "cyberpunk noir":
      styleKeywords =
        "cyberpunk art, noir film style, neon lighting, rain, character portrait";
      break;
    case "mystery":
      styleKeywords =
        "photorealistic, dramatic lighting, suspenseful, character portrait";
      break;
    case "horror":
      styleKeywords =
        "horror art, dark fantasy, atmospheric, unsettling, character portrait";
      break;
    case "western":
      styleKeywords =
        "western art, realistic painting, dusty, character portrait";
      break;
    // Add more themes as needed
  }
  // Construct the prompt
  let prompt = `${gender} character named ${name}, ${theme}. ${styleKeywords}.`;
  // Append description if provided
  if (description && description.trim() !== "") {
    prompt += ` Additional details: ${description.trim()}.`;
  }
  return prompt;
}

// --- The Core LLM Prompt  ---
// Keep this focused on the task and JSON structure requirements
const GM_BASE_PROMPT = `
You are: An expert AI Game Master (GM) facilitating a dynamic, text-based role-playing adventure game. Your purpose is to create and manage an engaging, interactive narrative experience for potentially multiple users (the players) in the same session.

Core Objective: To act as the eyes, ears, and rules engine of the game world. You will interpret the acting player's action, determine outcomes based on the established genre and context, and advance the story for everyone in the session. Crucially, your entire response MUST be a single, valid JSON object containing the narrative, an image prompt, suggested actions, location status, time of day, and details of non-player characters (NPCs) present.

Session Players & Acting Player:
{{playerList}} 
(The player marked '[Acting Player]' is the one performing the action for the current turn.)

Required JSON Output Structure:

{
  "narrative": "String containing the descriptive text of the current scene, events, and outcomes of the acting player's last action. Incorporate player character names where appropriate. Address the ACTING player primarily as 'You'. Refer to other players by their character name.",
  "timeOfDay": "String containing the time of day of the current scene, based on the immediate narrative.",
  "image_prompt": "String containing a descriptive prompt suitable for a text-to-image AI, capturing the essence of the scene described in 'narrative' from the ACTING player's perspective. Include genre style keywords. Describe the environment and any NPCs present. DO NOT include player characters in the image prompt.",
  "suggested_actions": [
    "String suggesting a possible action the ACTING player could take (relevant to the scene).",
    "String suggesting another possible action for the ACTING player.",
    "String suggesting a third, potentially unexpected or broader action.",
    "String suggesting a fourth, possibly absurd or non-sequitur action."
  ],
  "isSameLocation": "Boolean indicating if the players are in the same general location as the previous scene, or if they have moved to a new location.",
  "characters": [
    {
      "name": "String containing the name of a non-player character (NPC) involved in the immediate scene.",
      "description": "String containing the description of the NPC.",
      "appearance": "String containing a detailed description of the NPC's appearance, clothing, etc.",
      "opinionOfPlayer": "String containing the NPC's opinion towards the ACTING player, or their thoughts on the situation."
    }
    // Add more NPC objects if multiple NPCs are present and interacting.
  ]
}

Game Flow & Instructions:
- Initialization (First Turn): Given a Genre and the initial Player Character details (in {{playerList}}), create a compelling starting scenario, generate an appropriate image prompt, and suggest 4 actions they can take. Output JSON.
- Subsequent Turns: Given the previous narrative context, the full player list ({{playerList}}), and the specific Player Action from the indicated [Acting Player], interpret intent, determine outcome, update scene, generate new narrative, new image prompt, and new relevant suggested actions for the NEXT player. Output JSON.
- JSON Format Absolutely Mandatory: Your *entire* output must be *only* the JSON object. No introductory text, no explanations, just the JSON. Ensure it's valid.
- Genre Adherence: Strictly maintain the tone, logic, and visual style (fantasy art, cyberpunk, noir film, photorealistic etc.) of the genre in narrative, image_prompt, and suggestions.
- Player Agency: Respond logically to the acting player's action. Suggested actions are hints for the *next* player. Avoid railroading.
- Characters (NPCs): Only include non-player characters (NPCs) in the 'characters' list if they are actively present and relevant to the immediate scene. It is fine for the list to be empty. DO NOT include any player characters from {{playerList}} in this 'characters' array.
- Immersive Narrative: Write engaging descriptions. Primarily address the ACTING player as "You". Refer to other players by their names (e.g., "While you search the desk, Kael notices...").
- Consistent Image Prompts: Accurately reflect the narrative's visuals and mood from the acting player's viewpoint. Include genre/style keywords. Describe NPCs if present. Never explicitly name or describe player characters in the image prompt itself.
- Suggested Actions: Actions should be relevant possibilities for the player whose turn is *next*. The first option or two should be relevant to the current scenario, but always make two of the suggestions completely absurd and unexpected, even non-sequiters.
- World Consistency: Maintain continuity.
- No Meta-Gaming: Act as the GM within the game world.
- Clarity: Ensure the narrative clearly explains the situation and outcomes for all players present.
`.trim();

// --- Provider-Specific API Call Functions ---

async function callOpenAI(systemPrompt, userPrompt) {
  const response = await axios.post(
    OPENAI_API_ENDPOINT,
    {
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 seconds timeout
    }
  );
  // Return the raw JSON string for central parsing
  return response.data.choices[0]?.message?.content;
}

async function callGoogle(systemPrompt, userPrompt) {
  const endpoint = `${GOOGLE_API_ENDPOINT_TEMPLATE}?key=${GOOGLE_API_KEY}`;
  const response = await axios.post(
    endpoint,
    {
      // Structure for Gemini API
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json", // Crucial for JSON output
        temperature: 0.7,
        // candidateCount: 1 // Default is 1
      },
    },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 45000, // Slightly longer timeout for Gemini potentially
    }
  );
  // Return the raw JSON string for central parsing
  return response.data.candidates[0]?.content?.parts[0]?.text;
}

async function callAnthropic(systemPrompt, userPrompt) {
  const response = await axios.post(
    ANTHROPIC_API_ENDPOINT,
    {
      model: ANTHROPIC_MODEL,
      system: systemPrompt, // Anthropic uses a dedicated 'system' field
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 4096, // Required by Anthropic
      temperature: 0.7,
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "content-type": "application/json",
      },
      timeout: 40000, // Timeout for Anthropic
    }
  );
  // Return the raw JSON string for central parsing
  return response.data.content[0]?.text;
}

// --- **UPDATED** Central LLM Dispatcher with Retries and Validation ---
async function callLLM(promptContent, maxRetries = 3) {
  let lastError = null;
  const systemPrompt = GM_BASE_PROMPT; // Use the shared system prompt

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `--- Calling LLM Provider: ${ACTIVE_LLM_PROVIDER} (Attempt ${attempt}/${maxRetries}) ---`
    );
    try {
      let llmResponseContent; // Raw JSON string

      // 1. Dispatch to the correct provider function
      switch (ACTIVE_LLM_PROVIDER) {
        case "openai":
          llmResponseContent = await callOpenAI(systemPrompt, promptContent);
          break;
        case "google":
          llmResponseContent = await callGoogle(systemPrompt, promptContent);
          break;
        case "anthropic":
          llmResponseContent = await callAnthropic(systemPrompt, promptContent);
          break;
        default: // Should not happen due to startup check, but good failsafe
          throw new Error(
            `Invalid ACTIVE_LLM_PROVIDER configured: ${ACTIVE_LLM_PROVIDER}`
          );
      }

      if (!llmResponseContent) {
        throw new Error(
          `LLM response content is empty from ${ACTIVE_LLM_PROVIDER}.`
        );
      }

      console.log(
        `--- Received Raw LLM Response from ${ACTIVE_LLM_PROVIDER} ---`
      );
      // console.log(llmResponseContent);
      console.log("----------------------------------------");

      // 2. Try Parsing JSON (Centralized)
      let parsedJson;
      try {
        // Sometimes models might still wrap output slightly, try cleaning common prefixes/suffixes
        const cleanedResponse = llmResponseContent
          .trim()
          .replace(/^```json\s*/, "")
          .replace(/\s*```$/, "");
        parsedJson = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error(
          `LLM Response (Attempt ${attempt}/${maxRetries}) - Invalid JSON Syntax: ${parseError.message}`
        );
        console.error(
          `Raw Response that failed parsing: ${llmResponseContent}`
        );
        throw new Error(`Failed to parse LLM JSON response`);
      }

      // 3. Validate Structure and Types (Centralized)
      if (
        typeof parsedJson.narrative !== "string" ||
        typeof parsedJson.image_prompt !== "string" ||
        !Array.isArray(parsedJson.suggested_actions) ||
        !parsedJson.suggested_actions.every(
          (action) => typeof action === "string"
        )
      ) {
        console.error(
          `LLM Response (Attempt ${attempt}/${maxRetries}) - Missing/Invalid Keys or Types.`
        );
        console.error(
          `Parsed Object with issue: ${JSON.stringify(parsedJson, null, 2)}`
        );
        throw new Error(
          "LLM JSON response missing required keys or has invalid types."
        );
      }

      // --- NEW: Validate additional fields ---
      let validationError = null;
      if (typeof parsedJson.timeOfDay !== "string") {
        validationError =
          "Missing or invalid type for 'timeOfDay' (should be string).";
      } else if (typeof parsedJson.isSameLocation !== "boolean") {
        validationError =
          "Missing or invalid type for 'isSameLocation' (should be boolean).";
      } else if (!Array.isArray(parsedJson.characters)) {
        validationError =
          "Missing or invalid type for 'characters' (should be array).";
      } else if (
        !parsedJson.characters.every(
          (char) =>
            typeof char.name === "string" &&
            typeof char.description === "string" &&
            typeof char.appearance === "string" &&
            typeof char.opinionOfPlayer === "string"
        )
      ) {
        validationError =
          "Invalid structure or types within 'characters' array.";
      }

      if (validationError) {
        console.error(
          `LLM Response (Attempt ${attempt}/${maxRetries}) - Validation Error: ${validationError}`
        );
        console.error(
          `Parsed Object with issue: ${JSON.stringify(parsedJson, null, 2)}`
        );
        throw new Error(
          `LLM JSON response failed validation: ${validationError}`
        );
      }
      // --- End of new validation ---

      // Success!
      console.log(
        `LLM Response (Attempt ${attempt}/${maxRetries}) - Valid JSON received and structure verified.`
      );
      return parsedJson;
    } catch (error) {
      lastError = error;
      // Check if error is from axios (has response) or other source
      const errorMessage = error.response
        ? JSON.stringify(error.response.data)
        : error.message;
      console.warn(
        `LLM call attempt ${attempt}/${maxRetries} failed: ${errorMessage}`
      );

      // Simplified retry logic for now, could add specific status code checks
      if (attempt < maxRetries) {
        const delay = 500 * attempt;
        console.log(`Waiting ${delay}ms before next retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  } // End of retry loop

  // If loop finishes, all retries failed
  console.error(`LLM call failed permanently after ${maxRetries} attempts.`);
  throw new Error(
    `LLM (${ACTIVE_LLM_PROVIDER}) failed after ${maxRetries} attempts: ${
      lastError?.message || "Unknown LLM Error"
    }`
  );
}

// --- Imagen Generation Function (Modify to accept aspect ratio override) ---
async function generateImageWithImagen(prompt, aspectRatioOverride = null) {
  const effectiveAspectRatio = aspectRatioOverride || IMAGEN_ASPECT_RATIO;
  console.log(
    `Generating Imagen image (Ratio: ${effectiveAspectRatio}) for prompt: "${prompt}"`
  );
  const apiKey = GOOGLE_API_KEY;
  const endpoint = `${IMAGEN_API_ENDPOINT}?key=${apiKey}`;

  if (!prompt || prompt.trim() === "") {
    console.warn("Imagen prompt was empty, returning placeholder.");
    return `https://via.placeholder.com/1024x576.png?text=Missing+Prompt&ratio=${effectiveAspectRatio.replace(
      ":",
      "x"
    )}`;
  }

  try {
    const requestBody = {
      instances: [{ prompt: prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: effectiveAspectRatio, // Use the effective ratio
        // personGeneration: "ALLOW_ADULT" // Consider if needed for characters
      },
    };

    const response = await axios.post(endpoint, requestBody, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000,
    });

    const predictions = response.data?.predictions;
    if (
      predictions &&
      predictions.length > 0 &&
      predictions[0]?.bytesBase64Encoded
    ) {
      const base64Data = predictions[0].bytesBase64Encoded;
      console.log("Imagen generation successful.");
      return `data:image/png;base64,${base64Data}`;
    } else {
      console.error(
        "Imagen generation failed: Unexpected response structure.",
        JSON.stringify(response.data, null, 2)
      );
      throw new Error(
        "Imagen API response did not contain expected image data."
      );
    }
  } catch (error) {
    console.error(
      "Error generating image with Imagen:",
      error.response
        ? JSON.stringify(error.response.data, null, 2)
        : error.message
    );
    // Return placeholder with aspect ratio info
    return `https://via.placeholder.com/1024x576.png?text=Image+Generation+Failed&ratio=${effectiveAspectRatio.replace(
      ":",
      "x"
    )}`;
  }
}

async function generateImageWithGoogleFlash(prompt, base64Image = null) {
  const apiKey = GOOGLE_API_KEY;
  const endpoint = `${GOOGLE_FLASH_API_ENDPOINT_TEMPLATE}?key=${apiKey}`;

  console.log("Generating image with Google Flash for prompt: ", prompt);

  if (!prompt || prompt.trim() === "") {
    console.warn("Google Flash prompt was empty, returning placeholder.");
  }
  let contents;
  if (base64Image) {
    console.log("There is a base64 image, adding it to the prompt");
    contents = [
      { text: prompt },
      {
        inlineData: {
          mimeType: "image/png",
          data: base64Image,
        },
      },
    ];
  } else {
    contents = prompt;
  }

  try {
    const response = await googleGenAI.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: contents,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });
    const part = response.candidates[0]?.content?.parts[0];
    console.log("Part: ", part);

    if (part) {
      const imageData = part.inlineData.data;
      console.log("Flash generation successful.");
      return `data:image/png;base64,${imageData}`;
    } else {
      console.error("Flash generation failed: Unexpected response structure.");
      throw new Error(
        "Flash API response did not contain expected image data."
      );
    }
  } catch (error) {
    console.error(
      "Error generating image with Google Flash:",
      error.response
        ? JSON.stringify(error.response.data, null, 2)
        : error.message
    );
    return `https://via.placeholder.com/1024x576.png?text=Image+Generation+Failed`;
  }
}

async function generateImageWithOpenAI(prompt) {
  const apiKey = OPENAI_API_KEY;
  const endpoint = `${OPENAI_API_ENDPOINT}?key=${apiKey}`;

  if (!prompt || prompt.trim() === "") {
    console.warn("OpenAI prompt was empty, returning placeholder.");
  }

  console.log("Generating image with OpenAI with prompt: ", prompt);

  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt: prompt,
    size: "1024x1536",
    quality: "medium",
    moderation: "low",
  });

  const image_base64 = result.data[0].b64_json;

  return `data:image/png;base64,${image_base64}`;
}
// --- API Routes (/start and /action) ---
// No changes needed inside the route handlers themselves,
// as the selection, dispatch, and enhanced error handling
// are now within callLLM.

// POST /api/game/start - Start a new game
app.post("/api/game/start", authenticateToken, async (req, res) => {
  const {
    theme,
    characterName,
    characterGender,
    characterImageUrl, // Already handles optional image
    isMultiplayer, // NEW: Optional flag
    maxPlayers, // NEW: Optional max players
  } = req.body;
  const userId = req.user.id; // Get user ID from middleware

  // --- Validation ---
  if (!theme) return res.status(400).json({ error: "Theme is required." });
  if (!characterName)
    return res.status(400).json({ error: "Character name is required." });
  if (!characterGender)
    return res.status(400).json({ error: "Character gender is required." });
  if (!userId)
    return res.status(401).json({ error: "User ID missing after auth." });

  const isGameMultiplayer = !!isMultiplayer; // Ensure boolean
  const gameMaxPlayers = isGameMultiplayer ? parseInt(maxPlayers, 10) || 4 : 1;
  if (isGameMultiplayer && (gameMaxPlayers < 2 || gameMaxPlayers > 8)) {
    // Example limit: 2-8 players for multiplayer
    return res
      .status(400)
      .json({ error: "Multiplayer games must have between 2 and 8 players." });
  }
  // ----------------

  // --- Create Session ---
  const sessionId = uuidv4();
  const turnId = uuidv4();
  // Generate invite code only for multiplayer games
  const inviteCode = isGameMultiplayer
    ? `INV-${uuidv4().substring(0, 8).toUpperCase()}`
    : null;

  try {
    console.log(
      `User ${userId} starting ${
        isGameMultiplayer
          ? `multiplayer (Max: ${gameMaxPlayers}, Invite: ${inviteCode})`
          : "single-player"
      } game with theme: ${theme}, Name: ${characterName}, Gender: ${characterGender}`
    );

    // Prepare the initial prompt, replacing placeholders
    // No changes needed here immediately, but will need refinement later for MP context
    let initialSystemPrompt = GM_BASE_PROMPT.replace(
      /{{characterName}}/g,
      characterName
    ).replace(/{{characterGender}}/g, characterGender);
    initialSystemPrompt = initialSystemPrompt.replace(
      /{{characterImageUrl}}/g,
      characterImageUrl || "No image provided"
    );

    const initialUserInstruction = `Start a new adventure game in the ${theme} genre for character ${characterName} (${characterGender}). Generate the initial scenario...`;
    const combinedInitialPrompt = `${initialSystemPrompt}\n\nUser Instruction: ${initialUserInstruction}`;

    console.log("--- Sending Initial Prompt to LLM ---");
    const initialTurnData = await callLLM(combinedInitialPrompt);

    let imageUrl;
    switch (ACTIVE_IMAGE_PROVIDER) {
      case "google":
        imageUrl = await generateImageWithImagen(initialTurnData.image_prompt);
        break;
      case "google-flash":
        imageUrl = await generateImageWithGoogleFlash(
          initialTurnData.image_prompt
        );
        break;
      case "openai":
        imageUrl = await generateImageWithOpenAI(initialTurnData.image_prompt);
        break;
      default:
        throw new Error(
          `Invalid image provider: ${ACTIVE_IMAGE_PROVIDER}. Please check your environment variables.`
        );
    }

    // --- DB Ops ---
    await db.run("BEGIN");

    // --- Insert Session --- (Add multiplayer fields)
    const sessionInsertSql = `
      INSERT INTO sessions (
        session_id, user_id, theme, 
        -- Old character fields (kept for now)
        character_name, character_gender, character_image_url, 
        -- Multiplayer fields
        is_multiplayer, max_players, current_player_index, invite_code, 
        created_at, last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"), datetime("now"))
    `;
    const sessionParams = [
      sessionId,
      userId, // User who created the session
      theme,
      characterName, // Still store initial character for reference/SP
      characterGender,
      characterImageUrl,
      isGameMultiplayer ? 1 : 0, // is_multiplayer
      isGameMultiplayer ? gameMaxPlayers : null, // max_players
      isGameMultiplayer ? 0 : null, // current_player_index (starts at 0 for MP)
      inviteCode, // invite_code (null for SP)
    ];
    await db.run(sessionInsertSql, sessionParams);
    console.log(
      `Inserted session ${sessionId} (Multiplayer: ${isGameMultiplayer}) into DB.`
    );

    // --- Insert Creator into session_players --- (Do this for BOTH SP and MP)
    const playerInsertSql = `
      INSERT INTO session_players (
        session_id, user_id, player_index, 
        character_name, character_gender, character_image_url, 
        joined_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, datetime("now"), 1)
    `;
    const playerParams = [
      sessionId,
      userId, // The user creating the game
      0, // Always starts as player 0
      characterName,
      characterGender,
      characterImageUrl, // Use the provided URL
    ];
    await db.run(playerInsertSql, playerParams);
    console.log(
      `Inserted user ${userId} as player 0 into session_players for ${sessionId}.`
    );

    // --- Insert First Turn --- (No change needed here immediately, acting_player fields are for subsequent turns)
    const turnInsertSql = `INSERT INTO turns(
        turn_id, session_id, turn_index, scenario_text, image_url, image_prompt, suggested_actions, action_taken, time_of_day, is_same_location, characters, 
        created_at 
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))`; // 11 placeholders

    const turnParams = [
      // Should be 11 params
      turnId,
      sessionId,
      0, // turn_index
      initialTurnData.narrative,
      imageUrl,
      initialTurnData.image_prompt,
      JSON.stringify(initialTurnData.suggested_actions || []),
      null, // action_taken
      initialTurnData.timeOfDay,
      initialTurnData.isSameLocation ? 1 : 0,
      JSON.stringify(initialTurnData.characters || []),
    ];

    // ADD DEBUG LOGGING HERE
    console.log(
      `DEBUG: Attempting to insert Turn 0 for session ${sessionId} with ${turnParams.length} params.`
    );
    try {
      // Log params carefully, avoid excessively long strings if possible
      console.log(
        "DEBUG: Turn 0 Params (snippet):",
        JSON.stringify(
          turnParams.map((p) =>
            typeof p === "string" && p.length > 100
              ? p.substring(0, 100) + "..."
              : p
          )
        )
      );
    } catch (logErr) {
      console.error("DEBUG: Error logging turn params:", logErr);
    }

    await db.run(turnInsertSql, turnParams);

    // ADD DEBUG LOGGING HERE
    console.log(
      `DEBUG: Turn 0 inserted successfully for session ${sessionId}. Committing...`
    );

    await db.run("COMMIT");

    // --- Prepare Response ---
    const firstTurn = {
      turnIndex: 0,
      scenarioText: initialTurnData.narrative,
      imageUrl: imageUrl,
      imagePrompt: initialTurnData.image_prompt,
      suggestedActions: initialTurnData.suggested_actions || [],
      actionTaken: null,
      timeOfDay: initialTurnData.timeOfDay,
      isSameLocation: initialTurnData.isSameLocation,
      characters: initialTurnData.characters || [],
    };

    // Conditionally add inviteCode to response for multiplayer games
    const responsePayload = {
      sessionId: sessionId,
      currentTurn: firstTurn,
      ...(isGameMultiplayer && { inviteCode: inviteCode }), // Spread inviteCode only if multiplayer
    };

    res.status(201).json(responsePayload);
  } catch (error) {
    console.error(
      `Error starting game for user ${userId} (Char: ${characterName}):`,
      error
    );
    try {
      await db.run("ROLLBACK");
      console.error("DB rolled back due to error during game start."); // More specific log
    } catch (rbError) {
      console.error("Rollback failed:", rbError);
    }
    res.status(500).json({ error: `Failed to start game: ${error.message}` });
  }
});

// --- NEW: Endpoint to Join a Multiplayer Game ---
app.post("/api/game/join", authenticateToken, async (req, res) => {
  const {
    inviteCode,
    characterName,
    characterGender,
    characterImageUrl, // Optional
  } = req.body;
  const userId = req.user.id;

  // --- Validation ---
  if (!inviteCode)
    return res.status(400).json({ error: "Invite code is required." });
  if (!characterName)
    return res.status(400).json({ error: "Character name is required." });
  if (!characterGender)
    return res.status(400).json({ error: "Character gender is required." });
  if (!userId)
    return res.status(401).json({ error: "User ID missing after auth." });
  // ----------------

  try {
    await db.run("BEGIN");

    // 1. Find the session by invite code
    const session = await db.get(
      "SELECT session_id, max_players, is_multiplayer FROM sessions WHERE invite_code = ?",
      [inviteCode]
    );

    if (!session) {
      await db.run("ROLLBACK");
      return res.status(404).json({ error: "Invite code not found." });
    }

    if (!session.is_multiplayer) {
      await db.run("ROLLBACK");
      return res
        .status(400)
        .json({ error: "This session is not a multiplayer game." });
    }

    const sessionId = session.session_id;

    // 2. Check if user is already in the session
    const existingPlayer = await db.get(
      "SELECT 1 FROM session_players WHERE session_id = ? AND user_id = ?",
      [sessionId, userId]
    );
    if (existingPlayer) {
      await db.run("ROLLBACK");
      // Maybe return success and the sessionId, as they are already in?
      console.log(
        `User ${userId} attempted to join session ${sessionId} they are already in.`
      );
      return res
        .status(200)
        .json({ sessionId: sessionId, message: "Already joined." });
      // Or return a conflict error: return res.status(409).json({ error: "You are already in this session." });
    }

    // 3. Count current players and check against max_players
    const playerCountResult = await db.get(
      "SELECT COUNT(*) as count FROM session_players WHERE session_id = ?",
      [sessionId]
    );
    const playerCount = playerCountResult?.count ?? 0;

    if (playerCount >= session.max_players) {
      await db.run("ROLLBACK");
      return res.status(403).json({ error: "Session is full." });
    }

    // 4. Add the new player
    const nextPlayerIndex = playerCount; // 0-based index
    const playerInsertSql = `
      INSERT INTO session_players (
        session_id, user_id, player_index, 
        character_name, character_gender, character_image_url, 
        joined_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, datetime("now"), 1)
    `;
    await db.run(playerInsertSql, [
      sessionId,
      userId,
      nextPlayerIndex,
      characterName,
      characterGender,
      characterImageUrl || null, // Use provided URL or null
    ]);

    await db.run("COMMIT");

    console.log(
      `User ${userId} successfully joined session ${sessionId} as player ${nextPlayerIndex}.`
    );

    // --- Broadcast Update ---
    // Fetch the full updated state to broadcast
    const updatedSessionState = await getFullSessionState(sessionId); // Assumes helper function exists
    if (updatedSessionState) {
      broadcastSessionUpdate(sessionId, updatedSessionState);
    }
    // ----------------------

    res.status(200).json({ sessionId: sessionId }); // Keep simple response for joiner
  } catch (error) {
    console.error(
      `Error joining game with invite code ${inviteCode} for user ${userId}:`,
      error
    );
    try {
      await db.run("ROLLBACK");
    } catch (rbError) {
      console.error("Rollback failed during join error handling:", rbError);
    }
    // Handle potential UNIQUE constraint violation if race condition occurred (though unlikely with BEGIN/COMMIT)
    if (
      error.message.includes(
        "UNIQUE constraint failed: session_players.session_id, session_players.user_id"
      )
    ) {
      return res.status(409).json({
        error: "Concurrency error: You might already be in this session.",
      });
    }
    res.status(500).json({ error: `Failed to join game: ${error.message}` });
  }
});

// POST /api/game/action - Take an action
app.post("/api/game/action", authenticateToken, async (req, res) => {
  const { sessionId, action, turnIndex } = req.body;
  const requestUserId = req.user.id; // ID of the user making the request

  if (
    !sessionId ||
    action === undefined ||
    action === null ||
    turnIndex === undefined ||
    turnIndex === null
  )
    return res
      .status(400)
      .json({ error: "sessionId, action, and turnIndex are required." });

  if (!requestUserId)
    return res.status(401).json({ error: "User ID missing after auth." });

  const sourceTurnIndex = parseInt(turnIndex, 10);

  try {
    // --- 1. Fetch Session Details and ALL Players ---
    const session = await db.get(
      "SELECT session_id, theme, is_multiplayer, max_players, current_player_index FROM sessions WHERE session_id = ?",
      [sessionId]
    );
    if (!session) {
      console.warn(`Action submitted for non-existent session ${sessionId}`);
      return res.status(404).json({ error: "Session not found." });
    }

    const players = await db.all(
      "SELECT user_id, player_index, character_name, character_gender, character_image_url FROM session_players WHERE session_id = ? ORDER BY player_index ASC",
      [sessionId]
    );
    if (!players || players.length === 0) {
      throw new Error(
        `No players found for session ${sessionId}, data inconsistency.`
      );
    }

    // Find the details of the user making the request
    const requestingPlayer = players.find((p) => p.user_id === requestUserId);
    if (!requestingPlayer) {
      console.warn(
        `User ${requestUserId} tried to act in session ${sessionId} but is not listed as a player.`
      );
      return res
        .status(403)
        .json({ error: "You are not a player in this session." });
    }

    // --- 2. Validate Turn ---
    if (session.is_multiplayer) {
      if (session.current_player_index !== requestingPlayer.player_index) {
        const currentPlayerTurn = players.find(
          (p) => p.player_index === session.current_player_index
        );
        console.warn(
          `User ${requestUserId} (Index ${
            requestingPlayer.player_index
          }) tried to act out of turn in session ${sessionId}. Current turn index: ${
            session.current_player_index
          } (${currentPlayerTurn?.character_name || "Unknown"})`
        );
        return res.status(403).json({ error: "It's not your turn." });
      }
    } // Single player always allowed

    // --- 3. Check Connection Status of Current Player ---
    const currentPlayerIndex = session.current_player_index;
    const currentPlayerInfo = players.find(
      (p) => p.player_index === currentPlayerIndex
    );
    let isCurrentPlayerConnected = false;
    if (session.is_multiplayer && currentPlayerInfo) {
      const sessionConnections = sessionSockets.get(sessionId);
      isCurrentPlayerConnected =
        sessionConnections?.has(currentPlayerInfo.user_id) ?? false;
      console.log(
        `Turn Check: Current player ${currentPlayerInfo.character_name} (Index ${currentPlayerIndex}, User ${currentPlayerInfo.user_id}), Connected: ${isCurrentPlayerConnected}`
      );
    } else if (!session.is_multiplayer) {
      // Single player is always considered "connected" for turn logic
      isCurrentPlayerConnected = true;
    }

    // --- 4. Handle Action OR Skip Turn ---
    if (isCurrentPlayerConnected) {
      // --- 4a. PROCESS ACTION (Current Player is Connected) ---
      console.log(
        `User ${requestUserId} (Player Index ${currentPlayerIndex}) is connected. Processing action.`
      );
      await db.run("BEGIN"); // Start transaction for action processing
      try {
        // Get Max Turn Index & Validate sourceTurnIndex
        const maxTurnRow = await db.get(
          "SELECT MAX(turn_index) as max_index FROM turns WHERE session_id = ?",
          [sessionId]
        );
        const latestDbIndex = maxTurnRow?.max_index ?? -1;
        if (sourceTurnIndex < 0 || sourceTurnIndex > latestDbIndex) {
          throw new Error(
            `Invalid turnIndex ${sourceTurnIndex}. Must be between 0 and ${latestDbIndex}.`
          );
        }

        // Get History Context
        const historyRows = await db.all(
          `SELECT turn_index, scenario_text, action_taken, acting_player_user_id, acting_player_index 
                 FROM turns 
                 WHERE session_id = ? AND turn_index <= ? 
                 ORDER BY turn_index ASC`,
          [sessionId, sourceTurnIndex]
        );
        if (!historyRows || historyRows.length === 0) {
          throw new Error(
            `Could not find any history up to turn ${sourceTurnIndex} in session ${sessionId}`
          );
        }
        let historyContext = ""; // Build history context string
        historyRows.forEach((turn) => {
          historyContext += `Turn ${turn.turn_index}:\n`;
          // Find who acted based on turn data
          const playerWhoActed = players.find(
            (p) => p.player_index === turn.acting_player_index
          );
          const actionTakerName = playerWhoActed
            ? playerWhoActed.character_name
            : "System";

          if (turn.turn_index > 0) {
            historyContext += `Action Taken (by ${actionTakerName}): ${
              turn.action_taken || "(Unknown Action)"
            }\n`;
          } else {
            historyContext += `Action Taken: (Game Start)\n`;
          }
          historyContext += `Scenario: ${turn.scenario_text}\n\n`;
        });

        // Get Previous Image Data
        const previousImageRow = await db.get(
          "SELECT image_url FROM turns WHERE session_id = ? AND turn_index = ?",
          [sessionId, sourceTurnIndex]
        );
        const previousImageUrl = previousImageRow?.image_url;
        let base64PreviousImage = null; // Extract base64 if needed
        if (
          previousImageUrl &&
          previousImageUrl.startsWith("data:image/png;base64,")
        ) {
          base64PreviousImage = previousImageUrl.split(",")[1];
        } else if (previousImageUrl) {
          console.warn(
            "Previous image URL is not a base64 Data URL:",
            previousImageUrl
          );
        }

        // Prepare LLM Prompt with Multiplayer Context
        const playerListString = players
          .map(
            (p) =>
              `- ${p.character_name} (${p.character_gender}, Index: ${
                p.player_index
              })${p.user_id === requestUserId ? " [Acting Player]" : ""}`
          )
          .join("\n");
        let turnSystemPrompt = GM_BASE_PROMPT.replace(
          /{{characterName}}/g,
          requestingPlayer.character_name
        )
          .replace(/{{characterGender}}/g, requestingPlayer.character_gender)
          .replace(
            /{{characterImageUrl}}/g,
            requestingPlayer.character_image_url || "No image provided"
          );
        const turnUserInstruction = `
--- Player Characters ---
${playerListString}

--- Game History ---
${historyContext.trim()}

--- Player Action (from ${requestingPlayer.character_name}) ---
${action}

Determine the outcome and generate the next part of the story based on the entire history and the player's action. Ensure the narrative reflects the current scene and considers all players present. The response MUST be valid JSON.
`;
        const combinedTurnPrompt = `${turnSystemPrompt}\n\n${turnUserInstruction}`;
        console.log(
          `--- Sending Turn ${sourceTurnIndex + 1} Prompt to LLM ... ---`
        );
        const nextTurnData = await callLLM(combinedTurnPrompt);

        // Generate Image
        let newImageUrl = await generateImageWithAppropriateProvider(
          nextTurnData,
          base64PreviousImage
        );

        // Branching check
        if (sourceTurnIndex < latestDbIndex) {
          /* ... delete future turns ... */
        }

        // Insert New Turn
        const newTurnIndex = sourceTurnIndex + 1;
        const newTurnId = uuidv4();
        const turnInsertSql = `INSERT INTO turns(
                turn_id, session_id, turn_index, scenario_text, image_url, image_prompt, 
                suggested_actions, action_taken, time_of_day, is_same_location, characters, 
                acting_player_user_id, acting_player_index, -- NEWLY POPULATED
                created_at
              ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime("now"))`;
        await db.run(turnInsertSql, [
          newTurnId,
          sessionId,
          newTurnIndex,
          nextTurnData.narrative,
          newImageUrl,
          nextTurnData.image_prompt,
          JSON.stringify(nextTurnData.suggested_actions || []),
          action, // Record the action taken THIS turn
          nextTurnData.timeOfDay,
          nextTurnData.isSameLocation ? 1 : 0,
          JSON.stringify(nextTurnData.characters || []),
          requestUserId, // acting_player_user_id
          requestingPlayer.player_index, // acting_player_index
        ]);

        // Calculate next player index
        let nextPlayerIndex = currentPlayerIndex;
        if (session.is_multiplayer) {
          const numPlayers = players.length;
          // Simple round-robin for now
          nextPlayerIndex = (currentPlayerIndex + 1) % numPlayers;
        }

        // Update session last_updated_at and current_player_index
        await db.run(
          'UPDATE sessions SET last_updated_at = datetime("now"), current_player_index = ? WHERE session_id = ?',
          [nextPlayerIndex, sessionId]
        );

        await db.run("COMMIT"); // Commit transaction

        // Fetch Updated State & Broadcast
        const responsePayload = await getFullSessionState(sessionId);
        if (!responsePayload) {
          throw new Error(
            `Failed to retrieve session state for ${sessionId} after action.`
          );
        }

        console.log(
          `Advanced session ${sessionId} to turn ${newTurnIndex}. Next turn: Player Index ${responsePayload.currentPlayerIndex}.`
        );
        broadcastSessionUpdate(sessionId, responsePayload);
        res.status(200).json(responsePayload); // Send update to the requester
      } catch (actionError) {
        await db.run("ROLLBACK"); // Rollback on action processing error
        console.error(
          `Error processing action for session ${sessionId} (User: ${requestUserId}):`,
          actionError
        );
        // Re-throw or handle error response
        throw actionError; // Propagate to outer catch block
      }
    } else {
      // --- 4b. SKIP TURN (Current Player is Disconnected) ---
      console.warn(
        `Player ${currentPlayerInfo?.character_name} (Index ${currentPlayerIndex}) is disconnected. Skipping turn.`
      );
      await db.run("BEGIN"); // Start transaction for turn skip
      try {
        let nextConnectedPlayerIndex = -1;
        const numPlayers = players.length;
        let checkedCount = 0;
        let currentCheckIndex = currentPlayerIndex;

        while (checkedCount < numPlayers) {
          currentCheckIndex = (currentCheckIndex + 1) % numPlayers;
          const playerToCheck = players.find(
            (p) => p.player_index === currentCheckIndex
          );
          if (playerToCheck) {
            const sessionConnections = sessionSockets.get(sessionId);
            const isConnected =
              sessionConnections?.has(playerToCheck.user_id) ?? false;
            if (isConnected) {
              nextConnectedPlayerIndex = currentCheckIndex;
              break; // Found next connected player
            }
          }
          checkedCount++;
        }

        if (nextConnectedPlayerIndex !== -1) {
          console.log(
            `Found next connected player: Index ${nextConnectedPlayerIndex}. Updating session.`
          );
          // Update session current_player_index only
          await db.run(
            'UPDATE sessions SET current_player_index = ?, last_updated_at = datetime("now") WHERE session_id = ?',
            [nextConnectedPlayerIndex, sessionId]
          );
          await db.run("COMMIT"); // Commit the session update

          // Fetch Updated State & Broadcast
          const updatedState = await getFullSessionState(sessionId);
          if (!updatedState) {
            throw new Error(
              `Failed to retrieve session state for ${sessionId} after skipping turn.`
            );
          }

          broadcastSessionUpdate(sessionId, updatedState);
          // Send a specific response to the requester (who wasn't the one skipped)
          res.status(200).json({
            message: "Previous player disconnected, turn skipped.",
            updatedState,
          });
        } else {
          console.warn(
            `Session ${sessionId}: All players disconnected or no connected players found. Game paused.`
          );
          await db.run("ROLLBACK"); // No changes needed if no one is connected
          // Send response indicating game is paused or no active players
          res
            .status(409)
            .json({ error: "No active players available to take the turn." });
        }
      } catch (skipError) {
        await db.run("ROLLBACK"); // Rollback on skip processing error
        console.error(
          `Error skipping turn for session ${sessionId}:`,
          skipError
        );
        throw skipError; // Propagate to outer catch block
      }
    }
  } catch (error) {
    // Outer catch block for any unhandled errors (including propagated ones)
    console.error(
      `Unhandled error in POST /api/game/action for session ${sessionId}:`,
      error
    );
    // Ensure rollback is attempted if not already done
    db.get("PRAGMA journal_mode")
      .catch(() => {})
      .finally(() => {
        // Check if transaction active indirectly
        db.run("ROLLBACK").catch((rbError) =>
          console.error("Outer catch rollback failed:", rbError)
        );
      });

    if (error instanceof SyntaxError && error.message.includes("JSON.parse")) {
      res.status(500).json({ error: `Invalid data encountered.` });
    } else {
      res
        .status(500)
        .json({ error: `Failed to process action: ${error.message}` });
    }
  }
});

// Helper to consolidate image generation provider logic (Example)
async function generateImageWithAppropriateProvider(
  turnData,
  base64PreviousImage
) {
  switch (ACTIVE_IMAGE_PROVIDER) {
    case "google":
      return await generateImageWithImagen(turnData.image_prompt);
    case "google-flash":
      if (turnData.isSameLocation && base64PreviousImage) {
        return await generateImageWithGoogleFlash(
          turnData.image_prompt,
          base64PreviousImage
        );
      } else {
        return await generateImageWithGoogleFlash(turnData.image_prompt);
      }
    case "openai":
      return await generateImageWithOpenAI(turnData.image_prompt);
    default:
      throw new Error(`Invalid image provider: ${ACTIVE_IMAGE_PROVIDER}.`);
  }
}

// --- NEW: Game History Routes ---

// GET /api/games/history - List user's past game sessions
app.get("/api/games/history", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  if (!userId)
    return res.status(401).json({ error: "User ID missing after auth." });

  try {
    console.log(`Fetching game history for user ${userId}`);
    // Join sessions with session_players to find all sessions the user is part of
    // Also join with turns (index 0) for the snippet
    // Add a subquery to count players in each session
    const sessions = await db.all(
      `SELECT
        s.session_id,
        s.theme,
        s.created_at,
        s.last_updated_at,
        s.is_multiplayer, -- Include multiplayer flag
        (SELECT COUNT(*) FROM session_players sp_count WHERE sp_count.session_id = s.session_id) as player_count, -- Get player count
        t.scenario_text AS initial_scenario_snippet
      FROM sessions s
      JOIN session_players sp ON s.session_id = sp.session_id -- Ensure user is a player
      LEFT JOIN turns t ON s.session_id = t.session_id AND t.turn_index = 0
      WHERE sp.user_id = ? -- Filter by the requesting user in session_players
      ORDER BY s.last_updated_at DESC`,
      [userId]
    );

    // Add a fallback or trim the snippet if needed (no changes here)
    const sessionsWithSnippets = sessions.map((s) => ({
      ...s,
      initial_scenario_snippet: s.initial_scenario_snippet
        ? s.initial_scenario_snippet.substring(0, 100) +
          (s.initial_scenario_snippet.length > 100 ? "..." : "")
        : "[No scenario recorded for first turn]", // Fallback
      isMultiplayer: !!s.is_multiplayer, // Ensure boolean type in response
      playerCount: s.player_count || 0, // Ensure playerCount is present
    }));

    res.status(200).json(sessionsWithSnippets);
  } catch (error) {
    console.error(`Error fetching game history for user ${userId}:`, error);
    res.status(500).json({ error: "Failed to fetch game history." });
  }
});

// GET /api/games/history/:sessionId - Get full turn history for a specific session
app.get(
  "/api/games/history/:sessionId",
  authenticateToken,
  async (req, res) => {
    const userId = req.user.id;
    const { sessionId } = req.params;

    if (!userId)
      return res.status(401).json({ error: "User ID missing after auth." });
    if (!sessionId)
      return res.status(400).json({ error: "Session ID is required." });

    try {
      // 1. Verify session ownership OR participation
      // User needs to be either the original creator (in sessions table)
      // OR a player in the session_players table.
      const sessionRow = await db.get(
        "SELECT s.session_id, s.theme, s.is_multiplayer, s.current_player_index FROM sessions s WHERE s.session_id = ?",
        [sessionId]
      );

      if (!sessionRow) {
        console.warn(
          `User ${userId} tried to access non-existent session ${sessionId}.`
        );
        return res.status(404).json({ error: "Session not found." });
      }

      const playerCheck = await db.get(
        "SELECT 1 FROM session_players WHERE session_id = ? AND user_id = ?",
        [sessionId, userId]
      );

      if (!playerCheck) {
        console.warn(
          `User ${userId} tried to access session ${sessionId} they are not part of.`
        );
        return res
          .status(403)
          .json({ error: "Access denied to this session." });
      }

      // 2. Fetch all players for this session
      const players = await db.all(
        "SELECT user_id, player_index, character_name, character_gender, character_image_url FROM session_players WHERE session_id = ? ORDER BY player_index ASC",
        [sessionId]
      );

      // 3. Fetch all turns for this session
      console.log(
        `Fetching full turn history and player list for session ${sessionId} for user ${userId}`
      );
      const sessionHistoryRows = await db.all(
        `SELECT
           turn_index, scenario_text, image_url, image_prompt, suggested_actions, action_taken,
           time_of_day, is_same_location, characters,
           acting_player_user_id, acting_player_index -- Include acting player
         FROM turns WHERE session_id = ? ORDER BY turn_index ASC`,
        [sessionId]
      );

      const fullHistory = sessionHistoryRows.map((row) => ({
        turnIndex: row.turn_index,
        scenarioText: row.scenario_text,
        imageUrl: row.image_url,
        imagePrompt: row.image_prompt,
        suggestedActions: row.suggested_actions
          ? JSON.parse(row.suggested_actions)
          : [],
        actionTaken: row.action_taken,
        timeOfDay: row.time_of_day,
        isSameLocation: row.is_same_location === 1,
        characters: row.characters ? JSON.parse(row.characters) : [],
        actingPlayerUserId: row.acting_player_user_id,
        actingPlayerIndex: row.acting_player_index,
      }));

      // 4. Prepare response payload
      const responsePayload = {
        sessionId: sessionId,
        theme: sessionRow.theme,
        isMultiplayer: !!sessionRow.is_multiplayer,
        currentPlayerIndex: sessionRow.current_player_index,
        players: players.map((p) => ({
          // Return cleaned player list
          userId: p.user_id,
          playerIndex: p.player_index,
          characterName: p.character_name,
          characterGender: p.character_gender,
          characterImageUrl: p.character_image_url,
        })),
        history: fullHistory,
      };

      res.status(200).json(responsePayload);
    } catch (error) {
      console.error(
        `Error fetching history for session ${sessionId} for user ${userId}:`,
        error
      );
      if (error instanceof SyntaxError) {
        // Catch JSON parsing errors specifically
        res.status(500).json({
          error: "Failed to parse stored game data for this session.",
        });
      } else {
        res.status(500).json({ error: "Failed to fetch session history." });
      }
    }
  }
);

// --- NEW: Delete Game Session Route ---
app.delete(
  "/api/games/history/:sessionId",
  authenticateToken,
  async (req, res) => {
    const userId = req.user.id;
    const { sessionId } = req.params;

    if (!userId)
      return res.status(401).json({ error: "User ID missing after auth." });
    if (!sessionId)
      return res.status(400).json({ error: "Session ID is required." });

    try {
      // 1. Verify session ownership *before* deleting
      const sessionRow = await db.get(
        "SELECT session_id FROM sessions WHERE session_id = ? AND user_id = ?",
        [sessionId, userId]
      );

      if (!sessionRow) {
        console.warn(
          `User ${userId} attempted to delete session ${sessionId} which they don't own or doesn't exist.`
        );
        // Return 404 Not Found to avoid revealing existence
        return res
          .status(404)
          .json({ error: "Session not found or access denied." });
      }

      // 2. Delete the session (and associated turns due to FOREIGN KEY ON DELETE CASCADE)
      // Ensure your DB schema has ON DELETE CASCADE for the turns table foreign key
      console.log(`User ${userId} deleting session ${sessionId}`);
      await db.run("BEGIN");
      // If CASCADE is set, deleting from sessions will automatically delete related turns
      const result = await db.run(
        "DELETE FROM sessions WHERE session_id = ? AND user_id = ?",
        [sessionId, userId]
      );
      await db.run("COMMIT");

      if (result.changes > 0) {
        console.log(
          `Session ${sessionId} deleted successfully by user ${userId}.`
        );
        res.status(200).json({ message: "Session deleted successfully." });
      } else {
        // Should technically not happen if the SELECT check passed, but as a failsafe
        console.warn(
          `Session ${sessionId} not found for deletion for user ${userId}, though check passed earlier.`
        );
        res.status(404).json({ error: "Session not found for deletion." });
      }
    } catch (error) {
      await db
        .run("ROLLBACK")
        .catch((rbError) => console.error("Rollback failed:", rbError));
      console.error(
        `Error deleting session ${sessionId} for user ${userId}:`,
        error
      );
      res.status(500).json({ error: "Failed to delete session." });
    }
  }
);

// --- NEW: Character Image Upload Route ---
app.post(
  "/api/images/upload/character",
  authenticateToken,
  upload.single("characterImage"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const fileUrlPath = `/uploads/character_images/${req.file.filename}`;

    console.log(
      `User ${req.user?.id} uploaded character image: ${req.file.filename}`
    );
    res.status(200).json({ imageUrl: fileUrlPath });
  },
  (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      console.error("Multer upload error:", error);
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large (Max 5MB)." });
      }
      return res.status(400).json({ error: `Upload error: ${error.message}` });
    } else if (error) {
      console.error("Unknown upload error:", error);
      return res.status(400).json({ error: error.message });
    }
    next();
  }
);

// --- NEW: Character Image Generation Route ---
app.post(
  "/api/images/generate/character",
  authenticateToken, // Requires user to be logged in
  async (req, res) => {
    // Get description from body
    const { theme, characterName, characterGender, characterDescription } =
      req.body;
    const userId = req.user.id;

    if (!theme || !characterName || !characterGender) {
      return res.status(400).json({
        error:
          "Missing required fields: theme, characterName, characterGender.",
      });
    }

    try {
      console.log(
        `User ${userId} generating character image for: ${characterName} (${characterGender}), Theme: ${theme}, Desc: ${
          characterDescription || "None"
        }` // Log description
      );
      // 1. Generate the specific prompt for a character portrait, including description
      const characterPrompt = generateCharacterPrompt(
        theme,
        characterName,
        characterGender,
        characterDescription // Pass description here
      );

      // 2. Call Imagen with the character prompt and a portrait aspect ratio (e.g., "1:1")
      let imageUrl;
      switch (ACTIVE_IMAGE_PROVIDER) {
        case "google":
          imageUrl = await generateImageWithImagen(characterPrompt, "1:1");
          break;
        case "google-flash":
          imageUrl = await generateImageWithGoogleFlash(characterPrompt);
          break;
        case "openai":
          imageUrl = await generateImageWithOpenAI(characterPrompt);
          break;
      }

      // 3. Return the generated image URL (Base64 Data URL)
      res.status(200).json({ imageUrl: imageUrl });
    } catch (error) {
      console.error(
        `Error generating character image for user ${userId} (Char: ${characterName}):`,
        error
      );
      res
        .status(500)
        .json({ error: `Failed to generate image: ${error.message}` });
    }
  }
);

// --- Health Check  ---
app.get("/health", (req, res) => res.status(200).send("OK"));

// --- NEW: WebSocket Connection Handling ---
// Store active connections, mapping sessionId to a map of userId to socket
// Allows finding specific users or all users in a session
const sessionSockets = new Map(); // Removed TypeScript syntax

// --- MODIFIED: More explicit CORS origins for Socket.IO ---
const allowedOrigins = [
  process.env.FRONTEND_URL, // Primary origin from env
  "http://localhost:5173", // Explicitly allow default dev origin
  "https://infiniteadventure.co", // Explicitly allow the origin seen in logs
].filter(Boolean); // Filter out undefined/null if FRONTEND_URL is not set

const uniqueAllowedOrigins = [...new Set(allowedOrigins)]; // Remove duplicates
console.log("Socket.IO CORS Allowed Origins:", uniqueAllowedOrigins);

io.on("connection", (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);

  // 1. Authentication Listener
  socket.on("authenticate", async (data) => {
    const { token, sessionId } = data;
    if (!token || !sessionId) {
      console.log(
        `WS Auth Failed: Missing token or sessionId from ${socket.id}`
      );
      socket.emit("auth_error", {
        message: "Authentication failed: Token and sessionId required.",
      });
      socket.disconnect(true);
      return;
    }

    try {
      // Verify token (similar to REST middleware)
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        throw new Error("Invalid token payload.");
      }
      const userId = payload.sub;

      // Check if user is actually part of this session in the DB
      const playerCheck = await db.get(
        "SELECT 1 FROM session_players WHERE session_id = ? AND user_id = ?",
        [sessionId, userId]
      );
      if (!playerCheck) {
        throw new Error("User not part of the specified session.");
      }

      console.log(
        `WebSocket client ${socket.id} authenticated for user ${userId} in session ${sessionId}`
      );

      // Store the authenticated socket
      if (!sessionSockets.has(sessionId)) {
        sessionSockets.set(sessionId, new Map());
      }
      sessionSockets.get(sessionId)?.set(userId, socket);

      // Join the room for this session
      socket.join(sessionId);
      console.log(
        `Socket ${socket.id} (User ${userId}) joined room ${sessionId}`
      );

      // Send confirmation back to client
      socket.emit("authenticated");

      // Associate userId and sessionId with the socket object for easier cleanup on disconnect
      socket.data.userId = userId;
      socket.data.sessionId = sessionId;
    } catch (error) {
      console.error(`WS Auth Error for ${socket.id}:`, error.message);
      socket.emit("auth_error", {
        message: `Authentication failed: ${error.message}`,
      });
      socket.disconnect(true);
    }
  });

  // 2. Disconnect Listener
  socket.on("disconnect", (reason) => {
    console.log(
      `WebSocket client disconnected: ${socket.id}, Reason: ${reason}`
    );
    const { userId, sessionId } = socket.data; // Retrieve stored data

    if (userId && sessionId && sessionSockets.has(sessionId)) {
      const userMap = sessionSockets.get(sessionId);
      if (userMap?.delete(userId)) {
        console.log(
          `Removed user ${userId} from session ${sessionId} socket map.`
        );

        // --- NEW: Notify other players in the room ---
        // We use socket.broadcast.to() to send to everyone in the room *except* the disconnected socket itself
        socket.broadcast.to(sessionId).emit("player_left", { userId });
        console.log(`Notified room ${sessionId} that user ${userId} left.`);
        // ---------------------------------------------
      }
      // If the session map is now empty, remove the session entry
      if (userMap?.size === 0) {
        sessionSockets.delete(sessionId);
        console.log(`Removed empty session map for ${sessionId}.`);
      }
    }
  });

  // Optional: Handle generic errors
  socket.on("error", (error) => {
    console.error(`WebSocket Error (${socket.id}):`, error);
  });
});

// --- NEW: Broadcasting Helper Function ---
function broadcastSessionUpdate(sessionId, payload) {
  // Removed TypeScript syntax
  console.log(`Broadcasting SESSION_UPDATE to room ${sessionId}`);
  io.to(sessionId).emit("SESSION_UPDATE", payload);
}
// ------------------------------------------

// --- Start Server  ---
initializeDatabase()
  .then((dbInstance) => {
    db = dbInstance;
    // --- MODIFIED: Listen on HTTP server, not Express app ---
    server.listen(port, () => {
      console.log(
        `AI Adventure Backend (SQLite + Socket.IO) listening at http://localhost:${port}`
      );
      console.log(`--> Configured to use LLM Provider: ${ACTIVE_LLM_PROVIDER}`);
    });
    // ------------------------------------------------------
  })
  .catch((err) => process.exit(1));

// --- Graceful Shutdown  ---
process.on("SIGINT", async () => {
  console.log("\nShutting down server...");

  // Close WebSocket connections
  io.close(() => {
    console.log("WebSocket server closed.");
  });

  // Close DB connection
  if (db) {
    await db.close();
    console.log("Database connection closed.");
  }

  // Close HTTP server
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });

  // Force shutdown after a timeout if graceful shutdown fails
  setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 5000); // 5 seconds timeout
});

// --- Helper Function to Get Full Session State (NEW) ---
// Consolidates fetching session details, players, and history for broadcasting/response
async function getFullSessionState(sessionId) {
  try {
    const session = await db.get(
      "SELECT session_id, theme, is_multiplayer, current_player_index FROM sessions WHERE session_id = ?",
      [sessionId]
    );
    if (!session) return null; // Session not found

    const players = await db.all(
      "SELECT user_id, player_index, character_name, character_gender, character_image_url FROM session_players WHERE session_id = ? ORDER BY player_index ASC",
      [sessionId]
    );
    if (!players) return null; // Should not happen if session exists

    const historyRows = await db.all(
      `SELECT 
         turn_index, scenario_text, image_url, image_prompt, suggested_actions, action_taken,
         time_of_day, is_same_location, characters,
         acting_player_user_id, acting_player_index
       FROM turns WHERE session_id = ? ORDER BY turn_index ASC`,
      [sessionId]
    );

    const history = historyRows.map((row) => ({
      turnIndex: row.turn_index,
      scenarioText: row.scenario_text,
      imageUrl: row.image_url,
      imagePrompt: row.image_prompt,
      suggestedActions: row.suggested_actions
        ? JSON.parse(row.suggested_actions)
        : [],
      actionTaken: row.action_taken,
      timeOfDay: row.time_of_day,
      isSameLocation: row.is_same_location === 1,
      characters: row.characters ? JSON.parse(row.characters) : [],
      actingPlayerUserId: row.acting_player_user_id,
      actingPlayerIndex: row.acting_player_index,
    }));

    return {
      sessionId: sessionId,
      theme: session.theme,
      isMultiplayer: !!session.is_multiplayer,
      currentPlayerIndex: session.current_player_index,
      players: players.map((p) => ({
        userId: p.user_id,
        playerIndex: p.player_index,
        characterName: p.character_name,
        characterGender: p.character_gender,
        characterImageUrl: p.character_image_url,
      })),
      history: history,
    };
  } catch (error) {
    console.error(`Error fetching full session state for ${sessionId}:`, error);
    return null; // Return null on error
  }
}

// --- NEW: Get Basic Session Info via Invite Code (No Auth Required) ---
app.get("/api/invite/:inviteCode", async (req, res) => {
  const { inviteCode } = req.params;

  if (!inviteCode) {
    return res
      .status(400)
      .json({ error: "Invite code parameter is required." });
  }

  try {
    // Find session by invite code
    const session = await db.get(
      "SELECT session_id, theme, is_multiplayer, max_players FROM sessions WHERE invite_code = ?",
      [inviteCode]
    );

    if (!session) {
      return res
        .status(404)
        .json({ error: "Invite code not found or session expired." });
    }

    if (!session.is_multiplayer) {
      // Technically shouldn't happen if only MP games get codes, but good check
      return res
        .status(400)
        .json({ error: "Session is not a multiplayer game." });
    }

    // Count current players
    const playerCountResult = await db.get(
      "SELECT COUNT(*) as count FROM session_players WHERE session_id = ?",
      [session.session_id]
    );
    const playerCount = playerCountResult?.count ?? 0;
    const isFull = playerCount >= session.max_players;

    // Return minimal info needed for the join screen
    res.status(200).json({
      sessionId: session.session_id,
      theme: session.theme,
      isFull: isFull,
      playerCount: playerCount,
      maxPlayers: session.max_players,
    });
  } catch (error) {
    console.error(`Error fetching invite info for code ${inviteCode}:`, error);
    res.status(500).json({ error: "Failed to retrieve session information." });
  }
});
