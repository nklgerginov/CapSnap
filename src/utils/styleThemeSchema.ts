import { AnimationType, SubtitleStyle } from '../types';

export const STYLE_THEME_SCHEMA_VERSION = 1 as const;

export interface StyleThemeDocument {
  schema_version: typeof STYLE_THEME_SCHEMA_VERSION;
  font_family: string;
  font_size: number;
  primary_color: string;
  highlight_color: string;
  animation_type: AnimationType;
  emoji_enabled: boolean;
}

const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function styleToThemeDocument(style: SubtitleStyle): StyleThemeDocument {
  return {
    schema_version: STYLE_THEME_SCHEMA_VERSION,
    font_family: style.fontFamily,
    font_size: style.fontSize,
    primary_color: style.inactiveWordColor,
    highlight_color: style.activeWordColor,
    animation_type: style.animationType,
    emoji_enabled: style.emojiEnabled,
  };
}

export function isStyleThemeDocument(value: unknown): value is StyleThemeDocument {
  if (!value || typeof value !== 'object') return false;
  const theme = value as Partial<StyleThemeDocument>;
  return (
    theme.schema_version === STYLE_THEME_SCHEMA_VERSION &&
    typeof theme.font_family === 'string' &&
    theme.font_family.trim().length > 0 &&
    typeof theme.font_size === 'number' &&
    Number.isFinite(theme.font_size) &&
    theme.font_size > 0 &&
    typeof theme.primary_color === 'string' &&
    HEX_COLOR_PATTERN.test(theme.primary_color) &&
    typeof theme.highlight_color === 'string' &&
    HEX_COLOR_PATTERN.test(theme.highlight_color) &&
    typeof theme.animation_type === 'string' &&
    typeof theme.emoji_enabled === 'boolean'
  );
}

export function applyThemeDocument(
  style: SubtitleStyle,
  theme: StyleThemeDocument
): SubtitleStyle {
  if (!isStyleThemeDocument(theme)) {
    throw new Error('Invalid style theme document');
  }

  return {
    ...style,
    fontFamily: theme.font_family,
    fontSize: theme.font_size,
    inactiveWordColor: theme.primary_color,
    activeWordColor: theme.highlight_color,
    animationType: theme.animation_type,
    emojiEnabled: theme.emoji_enabled,
  };
}
