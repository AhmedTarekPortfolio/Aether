import { useEffect } from 'react';
import { UserProfile } from '../types';

export function useTheme(userProfile: UserProfile | null, updateProfile: (updates: Partial<UserProfile>) => Promise<void>) {
  useEffect(() => {
    const theme = userProfile?.theme || 'dark';
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [userProfile?.theme]);

  const toggleTheme = async () => {
    const currentTheme = userProfile?.theme || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    await updateProfile({ theme: nextTheme });
  };

  return {
    isLight: userProfile?.theme === 'light',
    toggleTheme,
  };
}
