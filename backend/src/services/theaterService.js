import { Theater } from "../models/Theater.js";
import { AppError } from "../utils/AppError.js";

export const createTheater = (data) => Theater.create(data);

export const updateTheater = async (id, updates) => {
  const theater = await Theater.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!theater) throw new AppError("Theater not found", 404, "NOT_FOUND");
  return theater;
};

export const deleteTheater = async (id) => {
  const theater = await Theater.findByIdAndDelete(id);
  if (!theater) throw new AppError("Theater not found", 404, "NOT_FOUND");
};

export const getTheaterById = async (id, { includeInactive = false } = {}) => {
  const theater = await Theater.findById(id);
  if (!theater || (!includeInactive && !theater.isActive)) {
    throw new AppError("Theater not found", 404, "NOT_FOUND");
  }
  return theater;
};

export const listTheaters = (filters = {}, { includeInactive = false } = {}) => {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (filters.city) query["location.city"] = filters.city;
  return Theater.find(query).sort({ name: 1 });
};
