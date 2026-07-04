import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSignupMutation, useLoginMutation } from "../api/authApi.js";

const SignupPage = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, { isLoading: isSigningUp }] = useSignupMutation();
  const [login, { isLoading: isLoggingIn }] = useLoginMutation();
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await signup({ name, email, password }).unwrap();
      // Signup doesn't set a session cookie itself, so log in right after
      // with the same credentials to avoid a separate manual sign-in step.
      await login({ email, password }).unwrap();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err?.data?.error?.message || "Could not create account");
    }
  };

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-16">
      <h1 className="text-lg font-semibold text-gray-900">Create an account</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          required
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
        />
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
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isSigningUp || isLoggingIn}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSigningUp || isLoggingIn ? "Creating account..." : "Sign up"}
        </button>
      </form>
      <p className="text-sm text-gray-500">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary">
          Sign in
        </Link>
      </p>
    </section>
  );
};

export default SignupPage;
