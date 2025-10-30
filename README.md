# Calorie Assistant

Simple mobile-focused web app to track food items, calories, and protein. Frontend: Next.js. Backend: Express + SQLite.

## Prerequisites

- Node.js 18+

## Setup

1. Backend
   - Install deps and start dev server:
     - PowerShell:
       ```powershell
       cd server
       npm install
       npm run dev
       ```

2. Frontend
   - Install deps and run Next.js:
     - PowerShell:
       ```powershell
       cd web
       npm install
       npm run dev
       ```

Open http://localhost:3000 in your phone or desktop browser. The API is served at http://localhost:4000.

The SQLite database file `calorie_assistant.db` will be created automatically in the server directory.


