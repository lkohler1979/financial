/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {},
  },
  // Evita conflito de reset com o Angular Material.
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};
