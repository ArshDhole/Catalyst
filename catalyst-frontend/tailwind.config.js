/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        paper: '#F6F4EE',
        parchment: '#EFEAE0',
        ink: '#16130E',
        soot: '#4A443A',
        faded: '#8A8175',
        hairline: '#E2DCCF',
        ember: {
          DEFAULT: '#E4571D',
          deep: '#B93F10',
          soft: '#FBE9DE',
        },
        moss: {
          DEFAULT: '#1F7A4D',
          soft: '#E2F2E8',
        },
      },
    },
  },
  plugins: [],
};
