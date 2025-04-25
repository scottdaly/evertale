/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  // Explicitly enable class-based dark mode for manual toggling
  darkMode: "class",
  theme: {
    extend: {},
  },
  plugins: [],
};
