import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-default-100">
      <Outlet />
    </div>
  );
}