import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useGetMeQuery } from "../api/authApi.js";

const ProtectedRoute = () => {
  const { data: user, isLoading, isError } = useGetMeQuery();
  const location = useLocation();

  if (isLoading) {
    return <p className="px-8 py-24 text-center text-gray-500">Loading...</p>;
  }

  if (isError || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
