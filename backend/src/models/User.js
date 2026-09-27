import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "theater_admin", "super_admin"],
      default: "user",
    },
    theater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theater",
      // Required for theater_admin only — a plain user or a super_admin
      // (global access, no single theater to assign) must remain valid with
      // no theater. `function` (not an arrow) so `this` is the document
      // being validated. See resolveTheaterScope, which stays as a runtime
      // backstop even with this in place.
      required: function () {
        return this.role === "theater_admin";
      },
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model("User", userSchema);
