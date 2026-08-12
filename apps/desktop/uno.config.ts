// uno.config.ts — aligned with AionUi root uno.config.ts
import {
  defineConfig,
  presetMini,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss";
import { presetExtra } from "unocss-preset-extra";

const textColors = {
  "t-primary": "var(--text-primary)",
  "t-secondary": "var(--text-secondary)",
  "t-tertiary": "var(--text-tertiary)",
  "t-disabled": "var(--text-disabled)",
};

const semanticColors = {
  primary: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
};

const backgroundColors = {
  base: "var(--bg-base)",
  1: "var(--bg-1)",
  2: "var(--bg-2)",
  3: "var(--bg-3)",
  4: "var(--bg-4)",
  5: "var(--bg-5)",
  6: "var(--bg-6)",
  8: "var(--bg-8)",
  9: "var(--bg-9)",
  10: "var(--bg-10)",
  hover: "var(--bg-hover)",
  active: "var(--bg-active)",
};

const borderColors = {
  "b-base": "var(--border-base)",
  "b-light": "var(--border-light)",
  "b-1": "var(--bg-3)",
  "b-2": "var(--bg-4)",
  "b-3": "var(--bg-5)",
};

const brandColors = {
  brand: "var(--brand)",
  "brand-light": "var(--brand-light)",
  "brand-hover": "var(--brand-hover)",
};

const aouColors = {
  aou: {
    1: "var(--aou-1)",
    2: "var(--aou-2)",
    3: "var(--aou-3)",
    4: "var(--aou-4)",
    5: "var(--aou-5)",
    6: "var(--aou-6)",
    7: "var(--aou-7)",
    8: "var(--aou-8)",
    9: "var(--aou-9)",
    10: "var(--aou-10)",
  },
};

export default defineConfig({
  presets: [presetMini(), presetExtra(), presetWind3()],
  transformers: [transformerVariantGroup(), transformerDirectives({ enforce: "pre" })],
  content: {
    pipeline: {
      include: [/\.[jt]sx?($|\?)/, /\.css($|\?)/],
      exclude: [/[\\/]node_modules[\\/]/, /\.html($|\?)/],
    },
  },
  rules: [
    [/^text-([1-4])$/, ([, d]) => ({ color: `var(--color-text-${d})` })],
    [/^bg-fill-([1-4])$/, ([, d]) => ({ "background-color": `var(--color-fill-${d})` })],
    [
      /^bg-(primary|success|warning|danger|link)-light-([1-4])$/,
      ([, color, d]) => ({ "background-color": `var(--color-${color}-light-${d})` }),
    ],
    [
      /^(bg|text|border)-(primary|success|warning|danger)-([1-9])$/,
      ([, prefix, color, d]) => {
        const prop =
          prefix === "bg" ? "background-color" : prefix === "text" ? "color" : "border-color";
        return { [prop]: `rgb(var(--${color}-${d}))` };
      },
    ],
    ["bg-color-white", { "background-color": "var(--color-white)" }],
    ["text-color-white", { color: "var(--color-white)" }],
    ["text-white", { color: "var(--text-white)" }],
  ],
  preflights: [
    {
      getCSS: () => `
        * { color: inherit; }
        *, ::before, ::after {
          border-width: 0;
          border-style: solid;
          border-color: transparent;
        }
      `,
    },
  ],
  shortcuts: {
    "flex-center": "flex items-center justify-center",
  },
  theme: {
    colors: {
      ...textColors,
      ...semanticColors,
      ...backgroundColors,
      ...borderColors,
      ...brandColors,
      ...aouColors,
    },
  },
});
