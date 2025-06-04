import { Moon, Sun } from 'lucide-react';

import { Toggle } from '@/components/ui/toggle';
import { useTheme } from '@/lib/contexts/theme-provider';

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  // Determine if we're in dark mode (including system preference)
  const isDarkMode =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleToggle = () => {
    setTheme(isDarkMode ? 'light' : 'dark');
  };

  return (
    <Toggle
      pressed={isDarkMode}
      onPressedChange={handleToggle}
      variant="outline"
      size="sm"
      aria-label="Toggle theme"
      className="hover:cursor-pointer"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Toggle>
  );
}
