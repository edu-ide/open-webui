import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user } = useAuth();

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;