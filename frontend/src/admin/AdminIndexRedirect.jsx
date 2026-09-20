import { Navigate } from "react-router-dom";
import { useGetMeQuery } from "../api/authApi.js";

// Where "/admin" lands, by role. Movie management (/api/admin/movies) is
// super_admin-only on the backend, so sending a theater_admin to the Movies
// page only ever produced a 403 — they land on their own theater's Analytics
// instead. Rendered inside AdminRoute, so the user is already loaded and is
// one of the two admin roles by the time this runs.
const AdminIndexRedirect = () => {
  const { data: user } = useGetMeQuery();
  const target = user?.role === "theater_admin" ? "/admin/analytics" : "/admin/movies";
  return <Navigate to={target} replace />;
};

export default AdminIndexRedirect;
