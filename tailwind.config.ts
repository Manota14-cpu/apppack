import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-montserrat)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        elevated: "hsl(var(--elevated))",
        surface: "hsl(var(--surface))",
        placeholder: "hsl(var(--placeholder))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-xl)",
      },
      fontSize: {
        display: ["36px", { lineHeight: "1.08", letterSpacing: "-0.04em", fontWeight: "700" }],
        section: ["16px", { lineHeight: "1.3", letterSpacing: "-0.015em", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.6", letterSpacing: "0.01em", fontWeight: "400" }],
        "body-lg": ["16px", { lineHeight: "1.6", letterSpacing: "0.005em", fontWeight: "400" }],
        caption: ["12.5px", { lineHeight: "1.45", letterSpacing: "0.015em", fontWeight: "500" }],
        kpi: ["32px", { lineHeight: "1", letterSpacing: "-0.035em", fontWeight: "700" }],
        overline: ["10.5px", { lineHeight: "1.4", letterSpacing: "0.08em", fontWeight: "600" }],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.4), 0 8px 24px -12px rgb(0 0 0 / 0.5)",
        glow: "0 0 24px rgb(255 255 255 / 0.06)",
        "glow-sm": "0 0 14px rgb(255 255 255 / 0.04)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          "0%": { opacity: "0", transform: "translate(-50%, -50%) scale(0.97)" },
          "100%": { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        skeleton: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        skeleton: "skeleton 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
