const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// Strips any key that could be interpreted as a MongoDB query operator
// ($gt, $where, $ne, ...) or a dot-notation field path — e.g. a login body
// of { email: { $gt: "" } } loses the $gt key, leaving email as an empty
// object, which fails validation/casting instead of ever reaching a query.
// Mutates in place (never reassigns the object it's given) so this is safe
// to run on req.query and req.params too: Express 5 exposes both as
// getters, so `req.query = sanitized` would throw, but mutating the
// existing object's own properties works regardless of Express version.
const sanitizeInPlace = (value) => {
  if (Array.isArray(value)) {
    value.forEach(sanitizeInPlace);
    return value;
  }
  if (!isPlainObject(value)) return value;

  for (const key of Object.keys(value)) {
    if (key.startsWith("$") || key.includes(".")) {
      delete value[key];
      continue;
    }
    sanitizeInPlace(value[key]);
  }
  return value;
};

export const sanitizeInput = (req, res, next) => {
  sanitizeInPlace(req.body);
  sanitizeInPlace(req.query);
  sanitizeInPlace(req.params);
  next();
};
