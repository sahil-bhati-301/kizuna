# ADR-0001: Hosting and auth provider
Status: accepted · Date: 2026-11-27

## Context
The architecture (arch §8.3, deployment topology) leaves hosting open: web on Vercel or next to the API; api and worker as 1–2 small stateless containers on Fly.io, Render or Railway; managed Postgres with point-in-time recovery; object storage with a CDN. Arch §14 item 1 leaves auth open between Better Auth and Clerk. Nothing deploys until W06 (W06-4 staging), but the choice shapes W05–W06 work. Owner task O-3.

Prices checked on 2026-11-27 (they change; re-check at W06):
- Fly.io: shared-cpu-1x, 512 MB ≈ $3.69/month per machine, billed by usage (official pricing page).
- Render: Starter instance (0.5 vCPU, 512 MB) ≈ $7/month per instance, flat; workers have no free tier (third-party 2026 guides, not confirmed on Render's own page).
- Api + worker at 512 MB each: Fly.io ≈ $7.40/month, Render ≈ $14/month.

## Decision
- **api and worker:** Fly.io. One image, two process groups (api, worker).
- **web:** Vercel.
- **Postgres:** Neon, with point-in-time recovery.
- **Object storage and CDN:** Cloudflare R2.
- **Auth:** Better Auth, self-hosted against our own Postgres (closes arch §14 item 1).

Main reasons: Fly.io costs about half Render's price for the same machines. Better Auth has no per-user fee and keeps users in our database, which suits RLS. Clerk would be quicker to set up but is hosted and priced per active user.

## Consequences
- Easier: low running cost while building (close to $0 on free tiers); adding api capacity is adding a machine; auth cost does not grow with users.
- Harder: Fly.io is more hands-on than Render (we own the fly.toml, health checks and scaling settings); we own auth upgrades and security fixes.
- Portability: the api and worker are a standard container and the database is plain PostgreSQL, so a move to Render, Railway or a VPS needs no code change.
- Revisit at launch: Vercel's Hobby plan is for non-commercial use only. Before Kizuna charges users, move web to Vercel Pro (≈ $20/month) or serve it from a container on Fly.io.
- Revisit at W06: re-check all prices and free-tier limits when the accounts are created (owner task O-12).
