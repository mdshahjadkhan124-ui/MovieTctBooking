import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useGetMeQuery } from "../api/authApi.js";

const ADMIN_ROLES = ["super_admin", "theater_admin"];

const AdminRoute = () => {
  const { data: user, isLoading, isError } = useGetMeQuery();
  const location = useLocation();

  if (isLoading) {
    return <p className="px-8 py-24 text-center text-gray-500">Loading...</p>;
  }

  if (isError || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!ADMIN_ROLES.includes(user.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Not authorized</h1>
        <p className="text-sm text-gray-500">
          Your account doesn't have access to the admin dashboard.
        </p>
        <Link to="/" className="mt-2 text-sm font-medium text-primary">
          Back to home
        </Link>
      </div>
    );
  }

  return <Outlet />;
};

export default AdminRoute;
