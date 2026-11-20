# HostGraber Internal Pricing & Quotation Management Portal

Internal full-stack web application for HostGraber's sales and technical support teams to browse active hosting plans without login friction, manage centralized pricing via Excel imports in the Admin Panel, track pricing history, and copy client-ready plain-text quotations with one click.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (HostGraber Dark Emerald theme)
- **Backend**: Node.js, Express.js (`server.ts`)
- **Database**: PostgreSQL with Drizzle ORM (`pg` connection pool)
- **Excel Processing**: SheetJS (`xlsx`) + Multer (`.xlsx`, `.xls`, `.csv`)
- **Authentication**: Local PostgreSQL password authentication (`scrypt` + HTTP-only session tokens) for the Admin Panel; zero-login public employee catalog for browsing plans and copying quotations.

## Environment Setup

1. Copy `.env.example` to `.env` and configure PostgreSQL variables:
   - `SQL_HOST` (host or Cloud SQL Auth Proxy socket path)
   - `SQL_DB_NAME`
   - `SQL_USER` / `SQL_PASSWORD` (application read/write user)
   - `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` (schema migration user)
   - `PORT` (defaults to `3000`)
   - `APP_URL`

## Installation & Database Schema Push

```bash
npm install
npx drizzle-kit push --config=src/db/drizzle.config.ts
```

## Two Panels & First-Time Demo Admin Setup

1. **Public Employee Plans & Pricing Panel** (default `/` view):
   - Opens immediately with zero login required for internal employees.
   - Displays active hosting plans, specifications, Monthly/Yearly/Biennial pricing, discounts, special offers, and one-click plain-text quotation copy.
2. **Admin Panel** (click **Admin Login** in the top navigation bar):
   - On first run, the server automatically seeds a demo Super Admin account:
     - **Username**: `admin` (or `admin@hostgraber.com`)
     - **Temporary Password**: `HostGraber@123`
   - Immediately after signing in with the demo account, the portal requires changing the default password before granting access to Admin Panel tools.
   - From **Admin Panel -> User Management**, a Super Admin can create additional `admin` or `super_admin` accounts, reset passwords, and manage access.

## Production Build & Linux VPS Deployment

```bash
# 1. Build frontend bundle
npm run build

# 2. Push database schema
npx drizzle-kit push --config=src/db/drizzle.config.ts

# 3. Start production server on port 3000 (use PM2 or systemd on a Linux VPS)
NODE_ENV=production npm start
```
