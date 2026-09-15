/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 极光主题色 — 蓝紫青过渡
        aurora: {
          indigo: '#6366f1',
          violet: '#8b5cf6',
          cyan: '#06b6d4',
          rose: '#f43f5e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      animation: {
        aurora: 'aurora 60s linear infinite',
        'border-beam': 'border-beam 4s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        aurora: {
          from: { backgroundPosition: '50% 50%, 50% 50%' },
          to: { backgroundPosition: '350% 50%, 350% 50%' },
        },
        'border-beam': {
          '100%': { 'offset-distance': '100%' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        glow: '0 0 24px rgba(99,102,241,0.35), 0 0 64px rgba(139,92,246,0.18)',
        'glow-rose': '0 0 24px rgba(244,63,94,0.45)',
        'glow-cyan': '0 0 24px rgba(6,182,212,0.4)',
      },
    },
  },
  plugins: [],
};