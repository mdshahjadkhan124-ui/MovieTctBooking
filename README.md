## Deployment

Backend deploys to Render, frontend to Vercel. Set `NODE_ENV=production` on
the backend — this switches the auth cookie to `sameSite: 'none'` +
`secure: true` (required for a cross-domain cookie) and makes `CLIENT_URL`
mandatory for CORS.

### Backend (Render) env vars

| Var | Notes |
|---|---|
| `PORT` | Render sets this automatically |
| `NODE_ENV` | `production` |
| `MONGO_URI` | MongoDB Atlas connection string |
| `REDIS_URL` | Use `rediss://` for a TLS provider (e.g. Upstash) |
| `CLIENT_URL` | Exact deployed frontend origin, e.g. `https://your-app.vercel.app` |
| `JWT_SECRET` | |
| `JWT_EXPIRES_IN` | |
| `SEED_ADMIN_EMAIL` | |
| `SEED_ADMIN_PASSWORD` | |
| `STRIPE_SECRET_KEY` | |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe dashboard's webhook endpoint for the deployed URL |

### Frontend (Vercel) env vars

| Var | Notes |
|---|---|
| `VITE_API_BASE_URL` | Deployed backend URL + `/api`, e.g. `https://your-backend.onrender.com/api` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` or `pk_live_...` |
