import React from "react";

interface GenreSelectorProps {
  onGenreSelected: (genre: string) => void;
  isLoading: boolean;
}

const genres = [
  "Apocalypse",
  "Fantasy",
  "Sci-Fi",
  "Mystery",
  "Horror",
  "Romance",
];

const genreImages: { [key: string]: string } = {
  Fantasy: "/images/fantasy.png",
  Horror: "/images/horror.png",
  Romance: "/images/romance.png",
  "Sci-Fi": "/images/scifi.png", // Use 'Sci-Fi' as the key
  Mystery: "/images/mystery.png",
  Apocalypse: "/images/apocalyptic.png", // Added Apocalypse
};

const genreColors: { [key: string]: string } = {
  Fantasy: "bg-[#5E4321]",
  Horror: "bg-[#323130]",
  Romance: "bg-[#44272B]",
  "Sci-Fi": "bg-[#22333C]",
  Mystery: "bg-[#233423]",
  Apocalypse: "bg-[#2F2430]",
};

const genreDescriptions: { [key: string]: string } = {
  Fantasy: "Magic and mythical creatures",
  Horror: "Fear, suspense, and horror",
  Romance: "Fall in love",
  "Sci-Fi": "Explore the future",
  Mystery: "Put together the clues",
  Apocalypse: "Survive the apocalypse",
};

const GenreSelector: React.FC<GenreSelectorProps> = ({
  onGenreSelected,
  isLoading,
}) => {
  return (
    <div className="mt-8 p-6 sm:p-8 bg-white dark:bg-transparent shadow-md dark:shadow-none rounded-lg border border-gray-200 dark:border-gray-700 max-w-3xl mx-4 md:mx-auto">
      <h2 className="text-2xl sm:text-4xl font-semibold mb-6 text-center text-gray-800 dark:text-gray-200 cormorant-upright-semibold">
        Choose Your Genre
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {genres.map((genre) => (
          <button
            key={genre}
            onClick={() => !isLoading && onGenreSelected(genre)}
            disabled={isLoading}
            className={`relative cursor-pointer group rounded-lg overflow-hidden shadow-sm hover:shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed py-2 px-2 noise-background ${
              genreColors[genre] || "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            <img
              src={genreImages[genre]}
              alt={genre}
              className="w-full h-full object-contain transition-opacity duration-300 group-hover:opacity-90"
            />
            <div className="absolute inset-x-0 bottom-6 p-4 flex items-end justify-center h-1/4">
              <div className="flex flex-col items-center">
                <h3 className="text-[#DDD09D] text-2xl font-bold text-center tracking-wide uppercase cormorant-upright-bold">
                  {genre}
                </h3>
                <p className="text-sm text-center text-[#C6B273]">
                  {genreDescriptions[genre]}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default GenreSelector;
