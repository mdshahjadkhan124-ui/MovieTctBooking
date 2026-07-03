import { AppError } from "./AppError.js";

// super_admin has global access; a theater_admin may only act on their own
// theater (req.user.theater, set at account creation — see admin/users route).
export const assertTheaterAccess = (user, theaterId) => {
  if (user.role === "theater_admin") {
    if (!user.theater || user.theater.toString() !== theaterId.toString()) {
      throw new AppError(
        "Not authorized to manage this theater",
        403,
        "FORBIDDEN"
      );
    }
  }
};
