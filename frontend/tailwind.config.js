export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Vazirmatn', 'Inter', 'ui-sans-serif', 'system-ui'] },
      colors: { ink: '#0f172a', brand: '#635bff', accent: '#22d3ee', danger: '#f43f5e' },
      boxShadow: { soft: '0 24px 80px rgba(15,23,42,.12)' },
    },
  },
  plugins: [],
};
