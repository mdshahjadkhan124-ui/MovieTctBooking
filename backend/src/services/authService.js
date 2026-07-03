import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

const toSafeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  theater: user.theater,
});

export const signup = async ({ name, email, password }) => {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("Email already in use", 409, "DUPLICATE");
  }

  // role is intentionally never taken from the request — public signup
  // can only ever create a plain "user".
  const user = await User.create({ name, email, password });
  return toSafeUser(user);
};

export const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  return { user: toSafeUser(user), userId: user._id };
};

export const createElevatedUser = async ({ name, email, password, role, theater }) => {
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("Email already in use", 409, "DUPLICATE");
  }

  const user = await User.create({
    name,
    email,
    password,
    role: role || "theater_admin",
    theater,
  });
  return toSafeUser(user);
};

export { toSafeUser };
