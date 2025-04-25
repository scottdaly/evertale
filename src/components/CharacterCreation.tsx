import React, { useState, useCallback, useEffect, useRef } from "react";
import { uploadCharacterImage, generateCharacterImage } from "../services/api";

// --- Sample Random Data (Expand as needed) ---
const firstNames = [
  "Adam",
  "Amanda",
  "Alex",
  "Alice",
  "Andrew",
  "Anthony",
  "Benjamin",
  "Bethany",
  "Brian",
  "Brendan",
  "Brittany",
  "Cameron",
  "Charlotte",
  "Christopher",
  "Claire",
  "Colin",
  "Connor",
  "Daniel",
  "David",
  "Diana",
  "Dylan",
  "Edward",
  "Emma",
  "Emily",
  "Ethan",
  "Eva",
  "Evan",
  "Fiona",
  "Frank",
  "George",
  "Gavin",
  "Gillian",
  "Gordon",
  "Graham",
  "Greg",
  "Hannah",
  "Heather",
  "Henry",
  "Ian",
  "Isabella",
  "Isaac",
  "Ivy",
  "Jack",
  "Jill",
  "Jim",
  "John",
  "Jane",
  "Jake",
  "Jasmine",
  "Joseph",
  "Julia",
  "Kai",
  "Katherine",
  "Kai",
  "Kyle",
  "Liam",
  "Lily",
  "Lionel",
  "Michael",
  "Matthew",
  "Mark",
  "Mary",
  "Morgan",
  "Nathan",
  "Olivia",
  "Oliver",
  "Owen",
  "Paul",
  "Pauline",
  "Peter",
  "Philip",
  "Richard",
  "Roberta",
  "Robert",
  "Rose",
  "Ruth",
  "Robin",
  "Rosa",
  "Rupert",
  "Scott",
  "Sarah",
  "Simon",
  "Stephen",
  "Susan",
  "Tara",
  "Tabitha",
  "Thomas",
  "Tina",
  "Tom",
  "Tony",
  "Tracy",
  "Trevor",
  "Troy",
  "Tyler",
  "Victoria",
  "Vincent",
  "Walter",
  "William",
  "Wendy",
  "Will",
  "Xavier",
  "Yvonne",
  "Zach",
  "Zoe",
];

const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Jones",
  "Brown",
  "Davis",
  "Miller",
  "Wilson",
  "Moore",
  "Taylor",
  "Anderson",
  "Thomas",
  "Jackson",
  "White",
  "Harris",
  "Martin",
  "Thompson",
  "Garcia",
  "Martinez",
  "Robinson",
  "Clark",
  "Rodriguez",
  "Lewis",
  "Lee",
  "Walker",
  "Hall",
  "Allen",
  "Young",
  "Hernandez",
  "King",
  "Wright",
  "Lopez",
  "Hill",
  "Scott",
  "Green",
  "Adams",
  "Baker",
  "Gonzalez",
  "Nelson",
  "Carter",
  "Mitchell",
  "Perez",
  "Roberts",
  "Turner",
  "Phillips",
  "Campbell",
  "Parker",
  "Evans",
  "Edwards",
  "Collins",
  "Stewart",
  "Morris",
  "Reid",
  "Foster",
  "Gillespie",
  "Mackenzie",
  "Paterson",
  "Reid",
  "Simpson",
  "Thomson",
  "Walker",
  "Watson",
  "Watson",
  "Lee",
  "Young",
  "Hill",
  "Moore",
  "Taylor",
  "Chan",
  "Lam",
  "Ng",
  "Cheung",
  "Chow",
  "Wong",
  "Chui",
  "Choi",
  "Chung",
  "Chu",
  "Trahan",
  "Tran",
  "Nguyen",
  "Pham",
  "Vo",
  "Goldberg",
  "Silverberg",
  "Goldman",
  "Silverman",
  "Goldstein",
  "Silverstein",
  "Poe",
  "Doyle",
  "Crichton",
  "Dickens",
  "Twain",
  "Armstrong",
  "Baker",
  "Carter",
  "Davis",
  "Evans",
  "Foster",
  "Wallace",
  "Watson",
  "Wright",
  "Young",
  "Zhao",
  "Zhou",
  "Zhu",
];

const fantasyFirstNames = [
  "Elara",
  "Jax",
  "Kael",
  "Seraphina",
  "Rhys",
  "Lyra",
  "Zane",
  "Anya",
  "Silas",
  "Mira",
  "Aria",
  "Caelum",
  "Elowen",
  "Kaelin",
  "Lilith",
  "Vale",
  "Nova",
  "Aether",
  "Aria",
  "Caelum",
  "Elowen",
  "Kaelin",
];
const fantasyLastNames = [
  "Meadowlight",
  "Ryder",
  "Stormblade",
  "Nightwhisper",
  "Ironwood",
  "Shadowclaw",
  "Sunstrider",
  "Voidwalker",
  "Stonefist",
  "Swiftbrook",
  "Breeze",
  "Faelight",
  "Revenant",
  "Touchstone",
  "Galenstorm",
];

// ----------------------------------------------

type ImageSource = "url" | "upload" | "generate"; // Type for image source selection
// NEW: Define possible modes for the component
type CreationMode =
  | "create-singleplayer"
  | "create-multiplayer"
  | "join-multiplayer";

interface CharacterCreationProps {
  theme: string; // Theme might be "Unknown" when joining
  onCharacterCreated: (characterData: {
    theme?: string; // Make theme optional in callback if joining
    name: string;
    gender: string;
    imageUrl?: string | null;
  }) => void;
  onCancel: () => void;
  isLoading: boolean;
  // --- NEW Props ---
  mode: CreationMode;
  inviteCode?: string; // Only relevant for join mode
}

const CharacterCreation: React.FC<CharacterCreationProps> = ({
  theme,
  onCharacterCreated,
  onCancel,
  isLoading,
  // Destructure new props
  mode,
  inviteCode, // May be undefined
}) => {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [imageUrl, setImageUrl] = useState(""); // Final URL for submission
  const [imageSource, setImageSource] = useState<ImageSource>("url");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [characterDescription, setCharacterDescription] = useState("");
  // --- NEW: State to remember last generated image ---
  const [lastGeneratedImageUrl, setLastGeneratedImageUrl] = useState<
    string | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Cleanup Object URL ---
  useEffect(() => {
    // Revoke the object URL to avoid memory leaks when the component unmounts
    // or when the previewUrl changes to something else (like the final URL)
    let currentPreview = previewUrl; // Capture value at time of effect setup
    return () => {
      if (currentPreview && currentPreview.startsWith("blob:")) {
        URL.revokeObjectURL(currentPreview);
        console.log("Revoked blob URL:", currentPreview);
      }
    };
  }, [previewUrl]); // Re-run when previewUrl changes

  // Adapt title based on mode
  const pageTitle =
    mode === "join-multiplayer"
      ? `Join Game (Invite: ${inviteCode || "..."})`
      : `Create Your Character for "${theme}"`;

  // Adapt submit button text
  const submitButtonText =
    mode === "join-multiplayer"
      ? isLoading
        ? "Joining..."
        : "Join Game"
      : isLoading
      ? "Starting..."
      : "Start Adventure";

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (!name.trim()) {
        setError("Character name cannot be empty.");
        return;
      }
      if (!gender) {
        setError("Please select a gender.");
        return;
      }
      if (isLoading || isImageLoading) return; // Prevent submission while loading anything

      setError(null);
      setImageError(null);
      onCharacterCreated({
        name: name.trim(),
        gender,
        imageUrl: imageUrl.trim() || null,
      });
    },
    [isLoading, isImageLoading, name, gender, onCharacterCreated, imageUrl]
  );

  // --- Randomize Name --- (Handle Unknown Theme)
  const handleRandomize = useCallback(() => {
    if (isLoading || isImageLoading) return;

    let first, last;
    // Use generic names if theme is unknown or not Fantasy
    if (theme === "Fantasy") {
      first =
        fantasyFirstNames[Math.floor(Math.random() * fantasyFirstNames.length)];
      last =
        fantasyLastNames[Math.floor(Math.random() * fantasyLastNames.length)];
    } else {
      // Handles "Unknown" theme and any other theme
      first = firstNames[Math.floor(Math.random() * firstNames.length)];
      last = lastNames[Math.floor(Math.random() * lastNames.length)];
    }
    setName(`${first} ${last}`);
  }, [isLoading, isImageLoading, theme]); // Add theme dependency

  // --- Modify Handle Image Source Change ---
  const handleImageSourceChange = (source: ImageSource) => {
    if (isLoading || isImageLoading) return;

    setImageSource(source);
    setImageError(null);

    // Clear current selections unless restoring generated image
    setImageUrl("");
    setPreviewUrl(null);

    // If switching TO generate AND we have a previously generated image, restore it
    if (source === "generate" && lastGeneratedImageUrl) {
      console.log("Restoring last generated image.");
      setImageUrl(lastGeneratedImageUrl);
      setPreviewUrl(lastGeneratedImageUrl);
    } else {
      // Otherwise, ensure things are cleared (redundant setImageUrl/previewUrl above, but safe)
      setImageUrl("");
      setPreviewUrl(null);
      // We don't clear lastGeneratedImageUrl here
    }
  };
  // ------------------------------------------

  // --- NEW: Function to Clear Current Image ---
  const handleClearImage = () => {
    console.log("Clearing current image preview and state.");
    setImageUrl(""); // Clear the final URL for submission
    setPreviewUrl(null); // Clear the preview
    setImageError(null); // Clear any errors
    setLastGeneratedImageUrl(null); // Forget the last generated one too
    // Optional: Reset file input if needed (might not be necessary as it clears on selection)
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    // Optional: Switch back to URL source?
    // setImageSource("url");
  };
  // -----------------------------------------

  // --- NEW: Handle File Input Change and Upload ---
  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files ? event.target.files[0] : null;
    // Reset file input value so the same file can be selected again if needed
    if (event.target) event.target.value = "";

    if (!file) {
      return;
    }

    // --- Basic File Validation ---
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const maxSize = 5 * 1024 * 1024; // 5 MB

    if (!allowedTypes.includes(file.type)) {
      setImageError(
        "Invalid file type. Please upload a JPG, PNG, WEBP, or GIF image."
      );
      return;
    }
    if (file.size > maxSize) {
      setImageError("File is too large. Maximum size is 5MB.");
      return;
    }
    // --- End Validation ---

    setImageError(null);
    setIsImageLoading(true);
    setPreviewUrl(null); // Clear previous preview before setting new blob url

    // Create a local preview URL
    const localPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(localPreviewUrl);
    console.log("Created blob URL:", localPreviewUrl);

    try {
      const response = await uploadCharacterImage(file);
      // Upload successful, use the URL returned by the backend
      setImageUrl(response.imageUrl); // Set the final URL for submission
      // Keep the local preview (blob URL) for display for now, or switch to response.imageUrl
      // setPreviewUrl(response.imageUrl); // Option: switch preview to final URL
      console.log("File uploaded successfully:", response.imageUrl);
    } catch (err: any) {
      console.error("Image upload failed:", err);
      const apiErrorMessage =
        err.response?.data?.error ||
        err.message ||
        "Upload failed. Please try again.";
      setImageError(`Upload failed: ${apiErrorMessage}`);
      setPreviewUrl(null); // Clear local preview on upload error
      setImageUrl(""); // Clear final URL on error
    } finally {
      setIsImageLoading(false);
    }
  };

  // --- Modify Handle AI Image Generation ---
  const handleGenerateImage = async () => {
    // Add check for unknown theme
    if (isLoading || isImageLoading || theme === "Unknown") return;
    if (!name.trim()) {
      setImageError(
        "Please enter a character name before generating an image."
      );
      return;
    }
    if (!gender) {
      setImageError("Please select a gender before generating an image.");
      return;
    }

    setIsImageLoading(true);
    setImageError(null);
    setPreviewUrl(null);

    try {
      const payload = {
        theme: theme,
        characterName: name.trim(),
        characterGender: gender,
        characterDescription: characterDescription.trim(),
      };
      const response = await generateCharacterImage(payload);
      // --- Store in lastGenerated as well ---
      setLastGeneratedImageUrl(response.imageUrl);
      setImageUrl(response.imageUrl); // Set final URL for submission
      setPreviewUrl(response.imageUrl); // Set preview
      console.log("AI Image generated successfully:", response.imageUrl);
    } catch (err: any) {
      console.error("AI Image generation failed:", err);
      const apiErrorMessage =
        err.response?.data?.error ||
        err.message ||
        "Generation failed. Please try again.";
      setImageError(`Generation failed: ${apiErrorMessage}`);
      setPreviewUrl(null);
      setImageUrl("");
      // Consider if we should clear lastGeneratedImageUrl on error?
      // setLastGeneratedImageUrl(null); // Optional: Uncomment to forget on error
    } finally {
      setIsImageLoading(false);
    }
  };
  // -------------------------------------

  // Helper to get button classes for gender selection (Keep existing)
  const getGenderButtonClass = (value: string) => {
    const baseClass =
      "px-4 py-2 border rounded-md text-sm font-medium transition-colors disabled:opacity-50 flex-1";
    if (gender === value) {
      return `${baseClass} bg-blue-600 text-white border-blue-700 dark:bg-slate-600 dark:border-slate-500`;
    } else {
      return `${baseClass} bg-transparent border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600`;
    }
  };

  // Helper for image source radio buttons
  const getImageSourceRadioClass = (source: ImageSource) => {
    const base =
      "mr-4 inline-flex items-center cursor-pointer disabled:cursor-not-allowed";
    const text =
      imageSource === source
        ? "text-blue-600 dark:text-blue-400 font-semibold"
        : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200";

    const disabled = isLoading || isImageLoading ? "opacity-50" : "";
    return `${base} ${text} ${disabled}`;
  };

  // Update preview URL when imageUrl changes specifically for URL source type
  // This allows typing in the URL field to update the preview
  useEffect(() => {
    if (imageSource === "url") {
      // Basic URL validation (optional, can be improved)
      if (imageUrl.trim().match(/^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i)) {
        setPreviewUrl(imageUrl.trim());
        setImageError(null);
      } else if (imageUrl.trim() === "") {
        setPreviewUrl(null); // Clear preview if input is empty
        setImageError(null);
      } else {
        // Optional: Show error for invalid URL format while typing
        // setPreviewUrl(null);
        // setImageError("Invalid URL format");
      }
    }
  }, [imageUrl, imageSource]);

  return (
    <div className="character-creation-form bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 sm:p-8 w-full max-w-lg mx-auto">
      {/* Use dynamic title */}
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
        {pageTitle}
      </h2>
      {/* Display Invite Code if joining */}
      {mode === "join-multiplayer" && inviteCode && (
        <p className="text-sm text-center mb-4 text-gray-500 dark:text-gray-400">
          Attempting to join game with code:{" "}
          <strong className="text-gray-700 dark:text-gray-300">
            {inviteCode}
          </strong>
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name Input */}
        <div>
          <label
            htmlFor="charName"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Character Name
          </label>
          <div className="flex flex-row items-center gap-3">
            <input
              type="text"
              id="charName"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null); // Clear error on input change
              }}
              required
              maxLength={50} // Optional: Limit name length
              disabled={isLoading || isImageLoading}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              placeholder="E.g., Elara Meadowlight, Jax Ryder"
            />
            <button
              type="button"
              onClick={handleRandomize}
              disabled={isLoading || isImageLoading}
              className="px-2.5 py-2.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 w-full sm:w-auto h-full"
              title="Generate random name"
            >
              {/* Randomize Icon SVG */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 fill-white"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Gender Button Toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Gender <span className="text-red-500">*</span>
          </label>
          <div className="flex space-x-2" role="radiogroup" aria-label="Gender">
            <button
              type="button"
              role="radio"
              aria-checked={gender === "Female"}
              onClick={() =>
                !isLoading && !isImageLoading && setGender("Female")
              }
              disabled={isLoading || isImageLoading}
              className={getGenderButtonClass("Female")}
            >
              Female
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={gender === "Male"}
              onClick={() => !isLoading && !isImageLoading && setGender("Male")}
              disabled={isLoading || isImageLoading}
              className={getGenderButtonClass("Male")}
            >
              Male
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={gender === "Non-binary"}
              onClick={() =>
                !isLoading && !isImageLoading && setGender("Non-binary")
              }
              disabled={isLoading || isImageLoading}
              className={getGenderButtonClass("Non-binary")}
            >
              Non-binary
            </button>
          </div>
          {/* Hidden input for form validation */}
          <input
            type="text"
            value={gender}
            required
            readOnly
            className="opacity-0 absolute -z-10 w-0 h-0"
          />
        </div>

        {/* --- Character Image Section --- */}
        <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 pt-4">
            Character Image (Optional)
          </label>

          {/* Image Source Selection */}
          <div className="flex items-center">
            <label className={getImageSourceRadioClass("url")}>
              <input
                type="radio"
                name="imageSource"
                value="url"
                checked={imageSource === "url"}
                onChange={() => handleImageSourceChange("url")}
                className="mr-1 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 disabled:opacity-50"
                disabled={isLoading || isImageLoading}
              />
              Provide URL
            </label>
            <label className={getImageSourceRadioClass("upload")}>
              <input
                type="radio"
                name="imageSource"
                value="upload"
                checked={imageSource === "upload"}
                onChange={() => handleImageSourceChange("upload")}
                className="mr-1 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 disabled:opacity-50"
                disabled={isLoading || isImageLoading}
              />
              Upload File
            </label>
            <label
              className={`${getImageSourceRadioClass("generate")} ${
                theme === "Unknown" ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <input
                type="radio"
                name="imageSource"
                value="generate"
                checked={imageSource === "generate"}
                onChange={() =>
                  theme !== "Unknown" && handleImageSourceChange("generate")
                } // Prevent change if theme unknown
                className="mr-1 focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 disabled:opacity-50"
                disabled={isLoading || isImageLoading || theme === "Unknown"} // Disable radio itself
              />
              Generate with AI
            </label>
          </div>

          {/* Conditional Input Area */}
          <div className="mt-2 min-h-[80px]">
            {imageSource === "url" && (
              <div>
                <input
                  type="url"
                  id="character-image-url"
                  value={imageUrl} // Bind directly to imageUrl state for URL source
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/character.png"
                  disabled={isLoading || isImageLoading}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Paste a direct link to an image of your character.
                </p>
              </div>
            )}

            {imageSource === "upload" && (
              <div className="text-center p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md">
                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/png, image/jpeg, image/webp, image/gif" // Match allowed types
                  style={{ display: "none" }} // Hide the default input
                  disabled={isLoading || isImageLoading}
                />
                {/* Visible Button to trigger the hidden input */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()} // Trigger click on hidden input
                  disabled={isLoading || isImageLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImageLoading ? "Uploading..." : "Choose Image File"}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  (Max 5MB: JPG, PNG, WEBP, GIF)
                </p>
              </div>
            )}

            {imageSource === "generate" && (
              <div className="space-y-3">
                {/* Description Textarea */}
                <div>
                  <label
                    htmlFor="char-desc"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                  >
                    Brief Description (Optional)
                  </label>
                  <textarea
                    id="char-desc"
                    rows={3}
                    value={characterDescription}
                    onChange={(e) => setCharacterDescription(e.target.value)}
                    placeholder="e.g., wearing worn leather armor, has a scar over left eye, looks determined"
                    disabled={isLoading || isImageLoading}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50 resize-none"
                    maxLength={200} // Optional: Limit description length
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Add details to guide the AI portrait generation.
                  </p>
                </div>
                {/* Generate Button Area */}
                <div className="text-center">
                  <button
                    type="button"
                    onClick={handleGenerateImage}
                    // Disable button explicitly if theme is unknown, in addition to other checks
                    disabled={
                      isLoading ||
                      isImageLoading ||
                      !name.trim() ||
                      !gender ||
                      theme === "Unknown"
                    }
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      theme === "Unknown"
                        ? "AI Generation disabled (theme unknown)"
                        : !name.trim() || !gender
                        ? "Please enter name and select gender first"
                        : "Generate character portrait"
                    }
                  >
                    {isImageLoading
                      ? "Generating..."
                      : "Generate Portrait with AI"}
                  </button>
                  {theme === "Unknown" && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 italic">
                      AI generation requires a known theme.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Image Preview Area */}
          {(previewUrl || isImageLoading) && (
            <div className="relative mt-4 p-2 border border-gray-200 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 flex justify-center items-center min-h-[150px]">
              {/* Loading Indicator */}
              {isImageLoading && (
                <div className="text-gray-500 dark:text-gray-400">
                  Loading Image...
                </div>
              )}

              {/* Image Preview */}
              {!isImageLoading && previewUrl && (
                <img
                  src={previewUrl}
                  alt="Character Preview"
                  className="max-h-40 max-w-full rounded object-contain"
                  onError={(e) => {
                    console.error("Image preview error", e);
                    setPreviewUrl(null);
                    setImageError(
                      "Failed to load image preview. Check URL or file."
                    );
                    if (imageSource === "url") setImageUrl("");
                    setLastGeneratedImageUrl(null); // Also clear generated on error
                  }}
                />
              )}

              {/* Clear Button (Show only when preview exists and not loading) */}
              {!isImageLoading && previewUrl && (
                <button
                  type="button"
                  onClick={handleClearImage}
                  className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-black/70 text-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-700 focus:ring-white transition-colors"
                  aria-label="Clear image"
                  title="Clear image"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Image Error Display */}
          {imageError && (
            <p className="text-red-600 dark:text-red-400 text-sm font-medium mt-2">
              {imageError}
            </p>
          )}
        </div>
        {/* --- End Character Image Section --- */}

        {/* Form Error Display */}
        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm font-medium">
            {error}
          </p>
        )}

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4">
          <div className="flex space-x-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading || isImageLoading}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || isImageLoading || !name.trim() || !gender}
              className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-400 dark:disabled:bg-slate-700"
            >
              {/* Use dynamic button text */}
              {submitButtonText}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CharacterCreation;
