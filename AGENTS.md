# Acme Banking

A mock online-banking demo with a Go REST API backend and a React/Vite frontend, using SQLite for persistence.

## Overview

Acme Banking simulates a simple retail bank: users sign in, view their balance and transaction history, and perform deposits, withdrawals, and transfers between accounts. It is intentionally minimal — no real money, no real KYC, no real security — and exists as a starter scaffold for demos, prototypes, and connector experiments.

## Tech Stack

**Frontend:**
- React 19 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Lucide React for icons

**Backend:**
- Go 1.22+ (standard library `net/http` with Go 1.22 routing patterns)
- SQLite via `modernc.org/sqlite` (pure-Go driver — no CGO/gcc required on Windows)
- SHA-256 password hashes with a static salt (demo-grade; not production auth)
- Bearer-token sessions stored in SQLite

## Architecture

- **SPA Frontend:** Single-page React app with two screens (Login, Dashboard) talking to the API via `fetch`
- **REST API Backend:** Go HTTP server serving JSON under `/api`
- **Auth:** `POST /api/login` returns a random 32-byte hex token; all other endpoints expect `Authorization: Bearer <token>`
- **Persistence:** A single `bank.db` SQLite file in the backend directory, auto-created and seeded on first run
- **Dev Proxy:** Vite dev server proxies `/api/*` to the Go backend
- **Multi-instance Support:** Run multiple development instances in parallel — `Run.ps1` hashes the working directory path to pick a consistent port offset and probes for free ports from there

## Key Features

- **Simple login:** Username + password with pre-seeded demo users
- **Account overview:** Balance, account number, full name
- **Transaction ledger:** Every deposit, withdrawal, and transfer is recorded with the running balance and an optional counterparty
- **Banking operations:** Deposit, withdraw (with insufficient-funds check), and transfer between two accounts (atomic — both legs commit or neither does)

## Development

### Prerequisites
- Go 1.22+ on PATH
- Node.js 18+ and npm
- PowerShell 5.1+ or PowerShell 7 (Windows)

### Quick Start
```powershell
# Install dependencies and start dev servers
.\Run.ps1
```

`Run.ps1` will:
1. Run `go mod tidy` to fetch backend deps (first run only)
2. Run `npm install` for the frontend (first run only)
3. Start the Go backend and Vite dev server as background jobs on auto-assigned ports
4. Open the frontend in your default browser

Use `-BackendPort` / `-FrontendPort` to force specific ports, or `-NoBrowser` to suppress the browser launch.

### Demo Accounts

| Username | Password   | Account Number    | Starting Balance |
|----------|------------|-------------------|------------------|
| alice    | password   | ACME-1001-2034    | $1,250.00        |
| bob      | password   | ACME-1001-4521    | $3,847.50        |
| demo     | demo       | ACME-1001-0000    | $500.00          |

To wipe the data, stop the servers and delete `backend\bank.db` — it will be recreated and reseeded on next start.

### Project Structure
```
acme-banking-go-vite/
├── frontend/                  # React + Vite frontend
│   ├── src/
│   │   ├── components/        # Login.tsx, Dashboard.tsx
│   │   ├── api.ts             # Typed fetch client + token storage
│   │   ├── App.tsx            # Auth gate (Login vs Dashboard)
│   │   ├── main.tsx           # React entry point
│   │   └── index.css          # Tailwind directives
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── backend/                   # Go REST API
│   ├── main.go                # HTTP server, routing, graceful shutdown
│   ├── db.go                  # SQLite init + schema + seed data
│   ├── auth.go                # Session token issue/lookup, requireAuth middleware
│   ├── handlers.go            # /api/* handlers + helpers
│   ├── go.mod
│   └── go.sum
└── Run.ps1                    # Development launcher
```

## API Endpoints

All endpoints return JSON. Money is represented as integer cents to avoid floating-point rounding.

### Public
- `GET /api/health` — Health check
- `POST /api/login` — `{ username, password }` → `{ token, expires_at, user }`

### Authenticated (require `Authorization: Bearer <token>`)
- `POST /api/logout` — Invalidate the current session
- `GET /api/me` — Current user profile
- `GET /api/account` — Profile + balance
- `GET /api/transactions?limit=N` — Recent transactions (default 50, max 200), newest first
- `POST /api/deposit` — `{ amount_cents, description? }` → updated balance
- `POST /api/withdraw` — `{ amount_cents, description? }` → updated balance (rejects if insufficient funds)
- `POST /api/transfer` — `{ to_account, amount_cents, description? }` → `{ balance, recipient }`

### Transaction Kinds
- `deposit` — Positive amount, balance increases
- `withdraw` — Negative amount, balance decreases
- `transfer_out` — Negative amount on sender's ledger, paired with…
- `transfer_in` — …a positive amount on the recipient's ledger (same DB transaction)

## Data Model

```
users
  id, username, password_hash, full_name, account_number, balance_cents, created_at

transactions
  id, user_id, kind, amount_cents, balance_after_cents, description, counterparty, created_at

sessions
  token (PK), user_id, expires_at
```

## Security Notes

This is a **demo**. It deliberately skips production concerns:
- Password hashing uses SHA-256 with a static salt — use bcrypt/argon2 for anything real
- CORS is wide open (`*`) for local development
- No rate limiting, no CSRF tokens, no audit log, no input length caps beyond JSON decoding
- Tokens are stored in `localStorage` (vulnerable to XSS) rather than HttpOnly cookies
- The SQLite file ships in the working directory with no encryption at rest

Do not deploy this as-is.
