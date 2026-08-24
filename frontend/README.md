# ProcureFlow Frontend

Next.js 14 dashboard for the multi-agent procurement system.

## Stack

| Layer | Library |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Components | Radix UI primitives |
| Tables | TanStack Table v8 |
| Charts | Recharts |
| Forms | React Hook Form + Zod |
| State | Zustand |
| Data fetching | TanStack Query v5 |
| Icons | Lucide React |
| Notifications | Sonner |

## Prerequisites

- Node.js 18+ ([download](https://nodejs.org))
- npm 9+

## Setup & Run

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Pages

| Route | Description |
|---|---|
| `/` | Dashboard — KPIs, charts, agent status |
| `/file-uploads` | CSV/XLSX onboarding wizard |
| `/requests` | Procurement requests (next module) |
| `/purchase-orders` | Purchase orders (next module) |
| `/inventory` | Inventory view (next module) |
| `/vendors` | Vendor directory (next module) |
| `/agents` | Agent monitor (next module) |

## Environment Variables

Copy `.env.local` and update:

```
NEXT_PUBLIC_API_URL=http://localhost:8000   # FastAPI backend
NEXT_PUBLIC_APP_NAME=ProcureFlow
```

## Backend

The frontend talks to the FastAPI onboarding service at port 8000.
Start it separately:

```bash
cd ../services/onboarding-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Or use Docker Compose (see root docker-compose.yml when built).
