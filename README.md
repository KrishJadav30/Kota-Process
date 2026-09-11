# 🚀 KOTA Process — Automated Task Scheduler

A full-stack automated task scheduler built with **ASP.NET Core Web API (.NET 10)**, **React (Vite)**, **MSSQL Server**, and **Serilog** monthly rolling file logging.

---

## 🏗️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Radix UI Primitives, Inter Typography.
- **Backend**: ASP.NET Core Web API (.NET 10), `Microsoft.Data.SqlClient`, `Serilog.AspNetCore`, `Serilog.Sinks.File`, `Serilog.Sinks.Map`, `Cronos`.
- **Database**: Microsoft SQL Server (MSSQL).
- **Environment**: Centralized root `.env` dynamically read by both Backend and Frontend.

---

## 📁 Project Structure

```text
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI/CD Pipeline
├── backend/                     # ASP.NET Core Web API
│   ├── Services/
│   │   ├── EnvService.cs        # Dynamic root .env loader
│   │   ├── DatabaseService.cs   # MSSQL connection tester & queries
│   │   └── LogService.cs        # On-demand monthly log management
│   ├── Program.cs               # Kestrel server & Serilog configuration
│   └── KotaProcess.Api.csproj
├── frontend/                    # React + Vite Client
│   ├── src/
│   │   ├── api/                 # API service client
│   │   ├── components/ui/       # Shadcn UI primitives (Card, Badge, Button)
│   │   ├── App.tsx              # Main Dashboard
│   │   └── index.css            # Tailwind CSS & theme tokens
│   └── vite.config.ts           # Dynamic port & proxy configuration
├── logs/                        # Generated monthly logs (e.g. September_2026_logs.log)
├── .gitignore                   # Comprehensive ignore rules
└── README.md
```

---

## ⚙️ Configuration (`.env`)

Create a `.env` file in the root directory:

```env
# Server Configuration
FRONTEND_PORT=5173
BACKEND_PORT=5001

# Database Configuration
DB_SERVER=192.168.1.25
DB_USER=sa
DB_PASSWORD=YourPasswordHere
DB_DATABASE=WebmisDB

# Authentication
JWT_SECRET=your_jwt_secret_here
```

> **Dynamic Synchronization**: If you change any port or database variable in `.env`, both the React frontend and .NET Web API will automatically pick up the new values upon restart.

---

## 🚀 Getting Started

### 1. Run the Backend (.NET Web API)

```bash
cd backend
dotnet restore
dotnet watch
```

The backend will automatically bind to `BACKEND_PORT` (e.g., `http://localhost:5001`).

### 2. Run the Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server will launch on `FRONTEND_PORT` (e.g., `http://localhost:5173`) and automatically proxy `/api` requests to the backend.

---

## 📝 Monthly On-Demand Logging

- Log files are generated in the `logs/` directory.
- Format: `{MonthName}_{Year}_logs.log` (e.g., `September_2026_logs.log`).
- **On-Demand**: Log files for a month are created automatically when that month is reached.
