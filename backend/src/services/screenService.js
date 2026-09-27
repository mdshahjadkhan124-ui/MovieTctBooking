import { Screen } from "../models/Screen.js";
import { Theater } from "../models/Theater.js";
import { Showtime } from "../models/Showtime.js";
import { AppError } from "../utils/AppError.js";
import { assertTheaterAccess, resolveTheaterScope } from "../utils/assertTheaterAccess.js";

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

  // A screen carries the seat layout every showtime's seat grid is derived
  // from; deleting it would leave those showtimes unrenderable.
  const showtimeCount = await Showtime.countDocuments({ screen: id });
  if (showtimeCount > 0) {
    throw new AppError(
      `Can't delete this screen — it still has ${showtimeCount} showtime(s).`,
      409,
      "HAS_DEPENDENTS"
    );
  }

  await screen.deleteOne();
};

export const getScreenById = async (user, id) => {
  const screen = await Screen.findById(id);
  if (!screen) throw new AppError("Screen not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, screen.theater);
  return screen;
};

export const listScreens = async (user, filters = {}, { skip = 0, limit } = {}) => {
  const query = {};
  if (filters.theater) query.theater = filters.theater;
  const scope = resolveTheaterScope(user);
  if (scope) query.theater = scope;

  const [screens, total] = await Promise.all([
    Screen.find(query).skip(skip).limit(limit),
    Screen.countDocuments(query),
  ]);
  return { screens, total };
};
