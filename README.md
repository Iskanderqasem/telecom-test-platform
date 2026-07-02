# 📡 Telecom Test Automation Platform

> A professional end-to-end telecom network validation platform that automates mobile call and SMS testing using physical Android handsets — without any manual intervention.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-blue)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue)](https://postgresql.org)
[![Android](https://img.shields.io/badge/Android-11--14-brightgreen)](https://developer.android.com)

---

## 🎯 Overview

The Telecom Test Automation Platform automates VoLTE call and SMS testing across physical Samsung Android devices. It replaces manual test execution with automated, repeatable test runs — logging results, taking screenshots, and generating professional Excel/CSV reports.

**Key capabilities:**
- 📞 Automated VoLTE/VoWiFi/CS call testing (MO + MT with auto-answer)
- 💬 Automated SMS send and delivery confirmation
- 📊 Real-time dashboard with pass/fail tracking
- 📋 Professional reports with timestamps and execution history
- 👥 Multi-user with role-based access control (Admin / Tester / Viewer)
- 📁 Project management (BAU, CR, Regression, Sanity)
- 🔒 JWT authentication

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Web Dashboard (React)                                  │
│  telecom-test-platform.onrender.com  OR  localhost:4000 │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP/REST API
┌─────────────────▼───────────────────────────────────────┐
│  Backend (Node.js / Express)  — runs on laptop          │
│  - Execution Engine (ADB + APK HTTP)                    │
│  - Report Export (Excel/CSV)                            │
│  - Auth (JWT + bcrypt)                                  │
└────────────┬─────────────────┬────────────────┬─────────┘
             │ ADB TCP :8765   │ ADB TCP :8766  │ SSL/TLS
┌────────────▼──────┐  ┌───────▼──────────┐  ┌──▼──────────────────┐
│  Phone A          │  │  Phone B         │  │  Render PostgreSQL  │
│  TelecomTestAgent │  │  TelecomTestAgent│  │  (Singapore region) │
│  APK port 8765    │  │  APK port 8765   │  └─────────────────────┘
└───────────────────┘  └──────────────────┘
```

---

## 📁 Project Structure

```
telecom-test-platform/
├── backend/
│   ├── db/migrations/          # SQL schema migrations (001-004)
│   ├── scripts/migrate.js      # Database migration runner
│   ├── src/
│   │   ├── db/pool.js          # PostgreSQL connection (SSL auto-detect)
│   │   ├── routes/api.js       # All REST API endpoints
│   │   ├── routes/auth.js      # Authentication + user management
│   │   ├── services/execution/engine.js   # Test execution engine
│   │   └── services/reports/exportService.js  # Excel/CSV export
│   └── .env.example
├── frontend/src/main.jsx       # Complete React SPA (single file)
├── telecom-agent-apk/          # Android Studio project
│   └── app/src/main/java/com/telecom/testagent/
│       ├── TelecomTestAgentServer.kt  # NanoHTTPD HTTP server
│       ├── AgentService.kt            # Foreground service
│       ├── CallReceiver.kt            # Auto-answer
│       └── SmsReceiver.kt             # SMS capture
├── docs/                       # Full documentation
│   ├── INSTALLATION.md
│   ├── API.md
│   ├── USER_GUIDE.md
│   └── DEPLOYMENT.md
└── start-devices.bat           # ADB setup script for Windows
```

---

## ⚡ Quick Start

```bash
git clone https://github.com/Iskanderqasem/telecom-test-platform.git
cd telecom-test-platform/backend
npm install
cp .env.example .env          # Edit with your database URL
node scripts/migrate.js
npm run dev
```

Open **http://localhost:4000** — login: `admin` / `Admin@2degrees`

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for the complete setup guide.

---

## 📚 Documentation

| Document | Description |
|---|---|
| [Installation Guide](docs/INSTALLATION.md) | Step-by-step setup for all components |
| [API Reference](docs/API.md) | All REST endpoints with request/response examples |
| [User Guide](docs/USER_GUIDE.md) | Day-to-day usage — running tests, managing reports |
| [Deployment Guide](docs/DEPLOYMENT.md) | Render cloud deployment + GitHub Actions CI/CD |

---

## 📱 Tested Devices

| Role | Model | Android |
|---|---|---|
| Phone A | Samsung SM-A515F (Galaxy A51) | Android 11 |
| Phone B | Samsung SM-A528B (Galaxy A52s) | Android 12 |
| Supported | Any Samsung | Android 11–14 |

---

## 🔑 Default Login

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@2degrees` | Full admin — change after first login |

---

## 📄 License

MIT — see [LICENSE](LICENSE)
