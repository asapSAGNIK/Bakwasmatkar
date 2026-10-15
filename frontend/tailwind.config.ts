/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { heat: { low: "#22c55e", mid: "#f59e0b", high: "#ef4444" } },
    },
  },
  plugins: [],
};
