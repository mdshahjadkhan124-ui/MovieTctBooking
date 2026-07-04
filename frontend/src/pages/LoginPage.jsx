import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useLoginMutation } from "../api/authApi.js";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [login, { isLoading }] = useLoginMutation();
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await login({ email, password }).unwrap();
      navigate(location.state?.from?.pathname || "/", { replace: true });
    } catch (err) {
      setError(err?.data?.error?.message || "Invalid email or password");
    }
  };

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-16">
      <h1 className="text-lg font-semibold text-gray-900">Sign in</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          type="password"
          required
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-gray-500">
        New here?{" "}
        <Link to="/signup" className="font-medium text-primary">
          Create an account
        </Link>
      </p>
    </section>
  );
};

export default LoginPage;
