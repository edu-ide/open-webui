import { Button } from '@heroui/react';
import {
  SunIcon,
  MoonIcon,
  Bars3Icon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

interface NavbarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function Navbar({ 
  isSidebarOpen, 
  onToggleSidebar, 
  theme, 
  onToggleTheme 
}: NavbarProps) {

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isSidebarOpen && (
            <Button
              isIconOnly
              variant="light"
              onPress={onToggleSidebar}
              size="sm"
            >
              <Bars3Icon className="w-5 h-5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            variant="light"
            size="sm"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
          </Button>
          
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={onToggleTheme}
          >
            {theme === 'light' ? (
              <MoonIcon className="w-5 h-5" />
            ) : (
              <SunIcon className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}