# CLAUDE.md — Project Context for Claude Code

> This file gives Claude Code persistent context for the MovieBooking project.
> Read it fully before generating or editing any code. When conventions here
> conflict with a one-off instruction in chat, ask before deviating.

---

## 1. Project Overview

**What this is:** A full-stack MERN movie ticket booking system, built as a
portfolio/interview project targeting campus placements (~7 LPA level).

**The headline feature** (the "real problem solved" for interviews):
a **Smart Seat Recommendation Engine**. Given a screen's seat layout and a
requested seat count `N`, it finds the best contiguous block of seats using a
**sliding-window algorithm** scored by proximity to the ideal row/column
(avoids front rows, avoids back rows, prefers center columns), with a
**fallback that splits the block across adjacent rows** when no single row can
seat all `N`. Treat this feature as the crown jewel — code here should be
clean, well-commented, and testable, because it will be explained live in
interviews.

**Author's workflow:** Planning, concept discussion, and interview prep happen
in a separate Claude Pro chat project. Claude Code (you) is used to write and
edit actual code in this repo, sprint by sprint. Do not re-plan architecture
unprompted — implement the agreed plan and flag concerns.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Redux Toolkit, React Router, Tailwind CSS |
| Backend | Node.js, Express |
| Database | MongoDB with Mongoose |
| Caching / seat locking | Redis (TTL keys) |
| Auth | JWT + bcrypt, role-based |
| Payments | Stripe (test mode) |
| Extras | QR code generation for e-tickets |

**Roles:** `user`, `theater_admin`, `super_admin`.

---

## 3. Data Model (entities)

`User`, `Movie`, `Theater`, `Screen`, `Showtime`, `Seat`, `Booking`.

Exact schema shapes are finalized per-sprint in planning. Do not invent fields
— if a field is needed that isn't in the agreed schema, ask first.

---

## 4. Sprint Plan (source of truth for scope)

1. **Auth** (JWT, role-based middleware) — ✅ DONE
2. **Movie / Theater / Screen / Showtime CRUD** (admin) + public listing API — ✅ DONE
3. Seat layout + seat selection UI — ✅ DONE
4. Seat recommendation engine — ✅ DONE
5. Seat locking + booking flow (concurrency-safe, Redis TTL keys) — 🔜 CURRENT
6. Payment integration (Stripe test mode) + booking confirmation
7. Polish: search / filter, booking history, e-ticket with QR code
8. Testing + deployment

Only build the current sprint unless told otherwise. Don't scaffold future
sprints ahead of time.

---

## 5. Repository Structure

> Adjust to match the actual repo; keep this section updated as it grows.

```
/backend
  /src
    /config          # db, redis, env, stripe clients
    /models          # Mongoose schemas
    /controllers     # request handlers (thin)
    /services        # business logic (fat) — e.g. seat recommendation lives here
    /routes          # Express routers
    /middleware      # auth, role guards, error handler, validation
    /utils           # helpers (JWT, QR, etc.)
    /validators      # request body/param validation schemas
    app.js           # express app wiring
    server.js        # entry point
  /tests
/frontend
  /src
    /app             # redux store setup
    /features        # redux slices + feature components (auth, movies, booking…)
    /components      # shared/presentational components
    /pages           # route-level pages
    /api             # RTK Query / axios API layer
    /hooks
    /utils
```

---

## 6. Coding Conventions

**General**
- Language: JavaScript (ES modules, `import`/`export`) unless the repo already
  uses CommonJS — match whatever is already there.
- Prefer `async/await`; never mix with raw `.then()` chains.
- No secrets in code. Everything sensitive comes from `.env` (see §9).

**Backend**
- **Thin controllers, fat services.** Controllers parse/validate the request,
  call a service, and shape the response. Business logic lives in `/services`.
- Every route handler is wrapped so errors reach a **central error-handling
  middleware** — no try/catch boilerplate duplicated everywhere (use an
  `asyncHandler` wrapper).
- Validate all input at the edge (`/validators`) before it reaches a service.
- Mongoose: define indexes explicitly in schemas; never rely on implicit ones.
- Consistent API response envelope:
  ```json
  { "success": true, "data": {}, "message": "" }
  ```
  and for errors:
  ```json
  { "success": false, "error": { "code": "", "message": "" } }
  ```
- HTTP status codes must be correct and intentional (201 on create, 401 vs 403
  distinction matters, 409 on conflicts like seat-already-locked).

**Frontend**
- Redux Toolkit only — no legacy Redux boilerplate. Prefer RTK Query for
  server state where it fits.
- Tailwind utility classes; avoid ad-hoc CSS files unless truly necessary.
- Presentational components stay dumb; data-fetching/state lives in feature
  components or hooks.

**UI theme (homepage mockup already exists — match it):**
- BookMyShow-style layout: sticky header (logo + search bar + city selector +
  Sign in), hero carousel, "Recommended Movies" horizontal card row (poster,
  rating badge, title, genre), gradient event-category cards, dark footer.
- Palette: white background, accent red `#F84464`, dark navy footer, light gray
  section backgrounds.

---

## 7. Auth & Authorization (already built — respect it)

- JWT-based signup/login; passwords hashed with **bcrypt**.
- Role-based middleware guards routes by `user` / `theater_admin` / `super_admin`.
- Reuse the existing auth middleware for protected routes — do not reimplement.
- `theater_admin` should only manage resources for **their own** theater;
  `super_admin` has global access. Enforce ownership checks in services.

---

## 8. Seat Locking & Concurrency (Sprint 5 — for awareness now)

- Seat locks use **Redis keys with a TTL** so abandoned selections auto-release.
- Booking must be **concurrency-safe**: two users must never both confirm the
  same seat. Design controllers/services with this in mind even before Sprint 5
  (e.g. don't bake in assumptions that make locking hard to add later).

---

## 9. Environment Variables

Never commit real values. Keep `.env.example` current. Expected keys:

```
PORT=
MONGO_URI=
JWT_SECRET=
JWT_EXPIRES_IN=
REDIS_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CLIENT_URL=
```

---

## 10. Working Agreement (how to behave in this repo)

- **Explain before large changes.** For anything beyond a small edit, briefly
  state the plan, then implement.
- **One sprint at a time.** Don't pull scope forward.
- **Ask when the schema/route isn't specified** rather than inventing one.
- **Write it interview-defensible.** Favor clear, conventional solutions over
  clever ones; add short comments where a design decision isn't obvious
  (especially in the recommendation engine and locking logic).
- **Tests:** add unit tests for pure logic (recommendation engine scoring,
  fallback splitting) and integration tests for critical flows (booking).
- **Don't touch working modules** (like Auth) unless the task requires it.

---

## 11. Interview-Defensibility Notes

When implementing, keep these talking points sound — the author will be quizzed
on them:
- Why references vs embedded documents in the data model.
- Indexing choices and their query-performance rationale.
- Why Redis (not a DB flag) for seat locking; what the TTL protects against.
- How the recommendation engine's sliding window works and its time complexity.
- 401 vs 403, and where ownership checks live.

If a shortcut would undermine one of these, flag it instead of silently taking it.
