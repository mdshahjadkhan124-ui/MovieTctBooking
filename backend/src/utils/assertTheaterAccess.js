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

// The list/aggregate counterpart to assertTheaterAccess: those queries have
// no single target document to compare against, so they need a filter value
// rather than a yes/no check. Returns null for super_admin (no filter —
// global view is intentional) and the caller's own theater id otherwise.
//
// A theater_admin with no theater assigned is rejected rather than allowed
// through with an empty filter. assertTheaterAccess already refuses that
// account shape on every single-document route, but an aggregation's
// `$match: {}` matches everything, so without this the same broken account
// would be denied one screen yet handed every theater's revenue.
export const resolveTheaterScope = (user) => {
  if (user.role !== "theater_admin") return null;
  if (!user.theater) {
    throw new AppError("Not authorized to manage this theater", 403, "FORBIDDEN");
  }
  return user.theater;
};
