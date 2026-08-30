import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Vanderbilt-adjacent palette: black/gold accents on a neutral base.
        anchor: {
          gold: "#CFAE70",
          dark: "#1C1B18",
        },
      },
    },
  },
  plugins: [],
};

export default config;
