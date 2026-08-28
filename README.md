# Salesforce CRUD Console

A full-stack web app that performs **Create / Read / Update / Delete** on 5 Salesforce
standard objects — **Account, Opportunity, Lead, Contact, Case** — without leaving the
app. Authentication is handled via **OAuth 2.0** through a Salesforce **External
Client App**. Access & refresh tokens are stored server-side; the browser only holds an
opaque session token.

Built for the Associate Software Engineer assignment.

---

## Tech Stack

| Layer     | Technology                                     |
| --------- | ---------------------------------------------- |
| Frontend  | React 19 + React Router + Tailwind + shadcn/ui |
| Backend   | FastAPI (Python) + httpx                       |
| Database  | MongoDB (stores OAuth sessions)                |
| Auth      | Salesforce OAuth 2.0 (Web Server Flow, PKCE-less) |

---

## Features

- **Login with Salesforce** button (OAuth 2.0 Web Server Flow)
- **Central dropdown** to pick one of 5 standard objects
- **Dynamic table** showing 5–10 fields per object (configured in `backend/server.py`)
- **Infinite scroll pagination** — 20 records loaded per page
- **Row actions**: View, Update, Delete
- **Create / Update dialogs** with per-field validation
- **Delete confirmation dialog**
- Auto **refresh-token** handling if the access token expires
- Server-side token storage — browser only sees a session token

---

## Quick start

### 1. Create a Salesforce Developer Org

Sign up at <https://developer.salesforce.com/signup>.

### 2. Create an External Client App

In your Salesforce org, go to **Setup → External Client App Manager → New External
Client App**.

- **Contact Email**: your email
- Enable **OAuth Settings**
- **Callback URL**: `<YOUR_BACKEND_URL>/api/auth/callback`
  e.g. `https://your-app.preview.emergentagent.com/api/auth/callback`
- **OAuth Scopes**:
  - `Manage user data via APIs (api)`
  - `Perform requests at any time (refresh_token, offline_access)`
- Save. Wait a few minutes for propagation.
- Copy **Consumer Key** (Client ID) and **Consumer Secret** (Client Secret).

### 3. Configure `backend/.env`

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
CORS_ORIGINS="*"

SF_CLIENT_ID="<your consumer key>"
SF_CLIENT_SECRET="<your consumer secret>"
SF_REDIRECT_URI="<YOUR_BACKEND_URL>/api/auth/callback"
SF_LOGIN_URL="https://login.salesforce.com"          # or https://test.salesforce.com for sandbox
FRONTEND_URL="<YOUR_FRONTEND_URL>"
SF_API_VERSION="v60.0"
```

### 4. Install & run

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend
yarn install
yarn start
```

Visit the frontend URL → click **Login with Salesforce** → authorize → back to the
dashboard → pick an object → CRUD away.

---

## API surface (backend)

All routes prefixed with `/api`.

| Method | Path                                          | Purpose                       |
| ------ | --------------------------------------------- | ----------------------------- |
| GET    | `/auth/config`                                | Is OAuth configured?          |
| GET    | `/auth/login`                                 | Redirects to Salesforce login |
| GET    | `/auth/callback`                              | OAuth callback (Salesforce)   |
| GET    | `/auth/me`                                    | Current signed-in user        |
| POST   | `/auth/logout`                                | Logout + revoke token         |
| GET    | `/objects`                                    | List supported objects        |
| GET    | `/objects/{object}/fields`                    | Field metadata for the object |
| GET    | `/objects/{object}/records?offset=&limit=`    | List (paginated)              |
| GET    | `/objects/{object}/records/{id}`              | Read one                      |
| POST   | `/objects/{object}/records`                   | Create                        |
| PATCH  | `/objects/{object}/records/{id}`              | Update                        |
| DELETE | `/objects/{object}/records/{id}`              | Delete                        |

---

## Notes / trade-offs

- The set of shown fields per object is defined server-side in
  `OBJECT_FIELDS` inside `backend/server.py` (5–10 fields per object).
  Swap or extend the list freely.
- The app uses the **Salesforce REST API** (`/services/data/vXX.0`) to perform CRUD;
  no direct SOQL DML is exposed to the frontend.
- Sessions are simple opaque tokens stored in MongoDB. In production, add expiry &
  encryption at rest.

---

## Downloadable source

A ready-to-run archive of this project lives at `sf-crud-app.zip` in the repo root.
