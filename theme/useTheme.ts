import { useColorScheme } from '@/components/useColorScheme';
import { darkColors, lightColors, type ThemeColors } from '@/theme/index';

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
  };
}
