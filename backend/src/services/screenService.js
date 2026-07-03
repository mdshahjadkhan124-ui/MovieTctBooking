import { Screen } from "../models/Screen.js";
import { Theater } from "../models/Theater.js";
import { AppError } from "../utils/AppError.js";
import { assertTheaterAccess } from "../utils/assertTheaterAccess.js";

export const createScreen = async (user, data) => {
  const theater = await Theater.findById(data.theater);
  if (!theater) throw new AppError("Theater not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, theater._id);

  return Screen.create(data);
};

export const updateScreen = async (user, id, updates) => {
  const screen = await Screen.findById(id);
  if (!screen) throw new AppError("Screen not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, screen.theater);

  // theater is intentionally not reassignable here — moving a screen to a
  // different theater would need its own ownership check on the target too.
  const { layout, theater, ...rest } = updates;
  Object.assign(screen, rest);
  if (layout) {
    screen.layout = { ...screen.layout.toObject(), ...layout };
  }

  await screen.save();
  return screen;
};

export const deleteScreen = async (user, id) => {
  const screen = await Screen.findById(id);
  if (!screen) throw new AppError("Screen not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, screen.theater);
  await screen.deleteOne();
};

export const getScreenById = async (user, id) => {
  const screen = await Screen.findById(id);
  if (!screen) throw new AppError("Screen not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, screen.theater);
  return screen;
};

export const listScreens = async (user, filters = {}) => {
  const query = {};
  if (filters.theater) query.theater = filters.theater;
  if (user.role === "theater_admin") query.theater = user.theater;

  return Screen.find(query);
};
