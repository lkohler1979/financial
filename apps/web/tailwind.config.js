/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      // Mesmos valores do tema em src/styles.scss (identidade em docs/especificacao).
      colors: {
        brand: {
          50: "#e6f5f4",
          100: "#c2e7e5",
          200: "#99d7d4",
          300: "#6fc6c2",
          400: "#4db9b4",
          500: "#2aaca6",
          600: "#14958f",
          700: "#0b837e",
          800: "#08706b",
          900: "#054c49",
        },
        ink: "#1b2a33",
        muted: "#5b6b75",
        line: "#e4e9ec",
      },
      fontFamily: {
        sans: ["Inter", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  // Evita conflito de reset com o Angular Material.
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};
