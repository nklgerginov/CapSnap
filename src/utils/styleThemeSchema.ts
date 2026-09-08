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

export const CANONICAL_STYLE_THEMES: Record<string, StyleThemeDocument> = {
  gaming: {
    schema_version: 1,
    font_family: '"Chakra Petch", sans-serif',
    font_size: 60,
    primary_color: '#FFFFFF',
    highlight_color: '#00F0FF',
    animation_type: 'shake',
    emoji_enabled: true,
  },
  podcast: {
    schema_version: 1,
    font_family: '"Plus Jakarta Sans", sans-serif',
    font_size: 54,
    primary_color: '#FFFFFF',
    highlight_color: '#22C55E',
    animation_type: 'pop',
    emoji_enabled: false,
  },
  ads: {
    schema_version: 1,
    font_family: 'Montserrat, sans-serif',
    font_size: 62,
    primary_color: '#FFFFFF',
    highlight_color: '#FFE600',
    animation_type: 'bento_box',
    emoji_enabled: true,
  },
  lyrics: {
    schema_version: 1,
    font_family: 'Poppins, sans-serif',
    font_size: 52,
    primary_color: '#FFFFFF',
    highlight_color: '#FF007F',
    animation_type: 'karaoke',
    emoji_enabled: false,
  },
};

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
