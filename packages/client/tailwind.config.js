/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'admin-gold': '#D4AF37',
        'admin-dark-gold': '#B8941F',
        'admin-light-gold': '#E6C547',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-gold': 'pulseGold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGold: {
          '0%, 100%': { 
            opacity: '1',
            boxShadow: '0 0 0 0 rgba(212, 175, 55, 0.7)'
          },
          '70%': { 
            opacity: '0.7',
            boxShadow: '0 0 0 10px rgba(212, 175, 55, 0)'
          },
        },
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        'admin-dark': {
          'primary': '#D4AF37',
          'primary-focus': '#B8941F',
          'primary-content': '#000000',
          'secondary': '#1f2937',
          'secondary-focus': '#111827',
          'secondary-content': '#ffffff',
          'accent': '#D4AF37',
          'accent-focus': '#B8941F',
          'accent-content': '#000000',
          'neutral': '#374151',
          'neutral-focus': '#1f2937',
          'neutral-content': '#ffffff',
          'base-100': '#111827',
          'base-200': '#1f2937',
          'base-300': '#374151',
          'base-content': '#ffffff',
          'info': '#3ABFF8',
          'success': '#36D399',
          'warning': '#FBBD23',
          'error': '#F87272',
        },
      },
    ],
    base: false,
    styled: true,
    utils: true,
    prefix: '',
    logs: false,
  },
};
