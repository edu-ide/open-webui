import { Outlet, Navigate, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  Button, 
  Card, 
  CardBody,
  Spinner
} from '@heroui/react';
import { 
  UsersIcon,
  ChartBarIcon,
  CogIcon,
  CodeBracketIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';

export default function AdminLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  // Check if user is admin
  if (!user?.role || user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const navItems = [
    { path: '/admin/users', label: 'Users', icon: UsersIcon },
    { path: '/admin/evaluations', label: 'Evaluations', icon: ChartBarIcon },
    { path: '/admin/functions', label: 'Functions', icon: CodeBracketIcon },
    { path: '/admin/settings', label: 'Settings', icon: CogIcon },
  ];

  return (
    <div className="flex h-full">
      {/* Admin Sidebar */}
      <Card className="w-64 h-full rounded-none border-r">
        <CardBody className="p-4">
          <Button
            as={NavLink}
            to="/"
            variant="ghost"
            startContent={<ArrowLeftIcon className="w-4 h-4" />}
            className="mb-6 justify-start"
          >
            Back to App
          </Button>
          
          <h2 className="text-xl font-semibold mb-4">Admin Panel</h2>
          
          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </CardBody>
      </Card>

      {/* Admin Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}