import { Outlet, useOutletContext } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from '../components/layout/Sidebar';
import Navbar from '../components/layout/Navbar';

interface AppLayoutContext {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

export default function AppLayout() {
  const rootContext = useOutletContext<{ theme: 'light' | 'dark'; toggleTheme: () => void }>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const context: AppLayoutContext = {
    ...rootContext,
    isSidebarOpen,
    toggleSidebar,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar className={isSidebarOpen ? '' : 'hidden'} />

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Navbar */}
        <Navbar 
          isSidebarOpen={isSidebarOpen} 
          onToggleSidebar={toggleSidebar}
          theme={rootContext.theme}
          onToggleTheme={rootContext.toggleTheme}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}

// Hook to use the app layout context
export function useAppLayout() {
  return useOutletContext<AppLayoutContext>();
}