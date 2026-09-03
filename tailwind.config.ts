import type { Config } from "tailwindcss";
import {
  ScreenBreakpoints,
  StyleBorderRadius,
  StyleBoxShadow,
  StyleColors,
  StyleFontSize,
  StyleSpacing,
} from "./src/styles/styleConstants";

export default {
  theme: {
    screens: ScreenBreakpoints,
    extend: {
      colors: StyleColors,
      spacing: StyleSpacing,
      gap: StyleSpacing,
      borderRadius: StyleBorderRadius,
      boxShadow: StyleBoxShadow,
      fontSize: StyleFontSize,
    },
  },
} satisfies Config;
