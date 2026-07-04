import jwt from "jsonwebtoken";

export const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

// maxAge is a fixed 7d ceiling on the cookie itself; the JWT's own exp claim
// (JWT_EXPIRES_IN) is what actually invalidates the token on the server side.
//
// sameSite must be "none" (with secure: true) in production because the
// frontend (Vercel) and backend (Render) are on different domains — a
// cross-site cookie requires both. In dev they're both localhost, so
// "strict" + non-secure works and is the safer default.
export const cookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: isProduction ? "none" : "strict",
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};
