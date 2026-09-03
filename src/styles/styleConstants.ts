type CssReferenceMap = Record<string, string>;

const levels = ["UltraLow", "Lowest", "Lower", "Low", "Mid", "High", "Higher", "Highest", "UltraHigh"] as const;

function toKebabCase(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function addColorFamily(colors: CssReferenceMap, name: string, includeOnColor = true) {
  const title = `${name[0].toUpperCase()}${name.slice(1)}`;
  colors[name] = `var(--${name})`;

  for (const level of levels) {
    colors[`${name}${level}`] = `var(--${name}-${toKebabCase(level)})`;
  }

  if (!includeOnColor) return;

  colors[`on${title}`] = `var(--on-${name})`;
  for (const level of levels) {
    colors[`on${title}${level}`] = `var(--on-${name}-${toKebabCase(level)})`;
  }
}

export const ScreenBreakpoints = {
  sm: "480px",
  md: "768px",
  lg: "1200px",
  xl: "1440px",
  "2xl": "1920px",
} as const;

export const StyleSpacing = {
  xxs: "2px",
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
  "3xl": "64px",
} as const;

export const StyleBorderRadius = {
  xxs: "2px",
  xs: "3px",
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  card: "20px",
  panel: "24px",
  pill: "9999px",
} as const;

export const StyleBoxShadow = {
  gs1: "0px 1px 10px 1px rgba(0, 0, 0, 0.03)",
  gs2: "0px 2px 14px 2px rgba(0, 0, 0, 0.06)",
  gs3: "0px 4px 17px 3px rgba(0, 0, 0, 0.09)",
  gs4: "0px 6px 24px 4px rgba(0, 0, 0, 0.12)",
  gs5: "0px 8px 30px 6px rgba(0, 0, 0, 0.15)",
  bs04: "0px 2px 4px 0px rgba(0, 0, 0, 0.04), 0px 8px 16px 0px rgba(0, 0, 0, 0.09)",
} as const;

export const StyleFontSize = {
  "display-xl": ["44px", { fontWeight: "700", lineHeight: "1.25" }],
  "display-lg": ["30px", { fontWeight: "700", lineHeight: "1.25" }],
  "display-md": ["26px", { fontWeight: "700", lineHeight: "1.25" }],
  "display-sm": ["24px", { fontWeight: "700", lineHeight: "1.25" }],
  "display-xs": ["18px", { fontWeight: "700", lineHeight: "1.25" }],
  "headline-md": ["28px", { fontWeight: "700", lineHeight: "1.25" }],
  "headline-sm": ["21px", { fontWeight: "700", lineHeight: "1.25" }],
  "title-lg": ["20px", { fontWeight: "700", lineHeight: "1.25" }],
  "title-md": ["18px", { fontWeight: "700", lineHeight: "1.25" }],
  "title-sm": ["16px", { fontWeight: "700", lineHeight: "1.25" }],
  "title-xs": ["14px", { fontWeight: "700", lineHeight: "1.25" }],
  "label-xl": ["16px", { fontWeight: "500", lineHeight: "1.4" }],
  "label-lg": ["15px", { fontWeight: "500", lineHeight: "1.4" }],
  "label-md": ["14px", { fontWeight: "500", lineHeight: "1.4" }],
  "label-sm": ["13px", { fontWeight: "500", lineHeight: "1.4" }],
  "label-xs": ["12px", { fontWeight: "500", lineHeight: "1.4" }],
  "body-bold-xl": ["16px", { fontWeight: "700", lineHeight: "1.6" }],
  "body-bold-lg": ["15px", { fontWeight: "700", lineHeight: "1.6" }],
  "body-bold-md": ["14px", { fontWeight: "700", lineHeight: "1.6" }],
  "body-xl": ["16px", { fontWeight: "400", lineHeight: "1.6" }],
  "body-lg": ["15px", { fontWeight: "400", lineHeight: "1.6" }],
  "body-md": ["14px", { fontWeight: "400", lineHeight: "1.6" }],
  "body-sm": ["13px", { fontWeight: "400", lineHeight: "1.6" }],
  "body-xs": ["12px", { fontWeight: "400", lineHeight: "1.6" }],
  "caption-lg": ["12px", { fontWeight: "400", lineHeight: "1.6" }],
  "caption-md": ["11px", { fontWeight: "400", lineHeight: "1.6" }],
  "caption-sm": ["10px", { fontWeight: "400", lineHeight: "1.6" }],
} as const;

const colors: CssReferenceMap = {
  transparent: "var(--transparent)",
  canvas: "var(--canvas)",
  surfaceGlass: "var(--surface-glass)",
  surfaceGlassStrong: "var(--surface-glass-strong)",
  surfaceGlassFallback: "var(--surface-glass-fallback)",
  outlineGlass: "var(--outline-glass)",
  overlayWhite: "var(--overlay-white)",
  overlayWhiteLowest: "var(--overlay-white-lowest)",
  overlayWhiteLower: "var(--overlay-white-lower)",
  overlayWhiteLow: "var(--overlay-white-low)",
  overlayWhiteMid: "var(--overlay-white-mid)",
  overlayWhiteHigh: "var(--overlay-white-high)",
  overlayWhiteHigher: "var(--overlay-white-higher)",
  overlayWhiteHighest: "var(--overlay-white-highest)",
  overlayGray: "var(--overlay-gray)",
  overlayGrayLower: "var(--overlay-gray-lower)",
  overlayGrayLow: "var(--overlay-gray-low)",
  overlayGrayMid: "var(--overlay-gray-mid)",
  overlayGrayHigh: "var(--overlay-gray-high)",
  overlayGrayHigher: "var(--overlay-gray-higher)",
  overlayBlack: "var(--overlay-black)",
  overlayBlackLowest: "var(--overlay-black-lowest)",
  overlayBlackLower: "var(--overlay-black-lower)",
  overlayBlackLow: "var(--overlay-black-low)",
  overlayBlackMid: "var(--overlay-black-mid)",
  overlayBlackHigh: "var(--overlay-black-high)",
  overlayBlackHigher: "var(--overlay-black-higher)",
  overlayBlackHighest: "var(--overlay-black-highest)",
  variantSnackbar: "var(--variant-snackbar)",
  variantBackdrop: "var(--variant-backdrop)",
  changeIncrease: "var(--change-increase)",
  changeDecrease: "var(--change-decrease)",
  changeNeutral: "var(--change-neutral)",
};

for (const name of ["primary", "surface", "outline", "red", "orange", "yellow", "green", "teal", "cyan", "blue", "purple", "violet"]) {
  addColorFamily(colors, name);
}

export const StyleColors = colors;
