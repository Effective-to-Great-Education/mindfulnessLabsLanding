# Mindfulness Labs Landing Page

Landing page website for Mindfulness Labs. (This README is in the Github and README folder.)

This site collects interest (name, email, role, optional message) and sends it to a small backend API, which creates/updates a contact in Wix CRM.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (version 18 or higher)
- npm (comes with Node.js)

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/avery-espiritu/mindfulnessLabsLanding.git
   cd mindfulnessLabsLanding
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the project root:

   ```bash
   WIX_SITE_ID="<your-wix-site-id>"
   WIX_API_KEY="<your-wix-api-key>"
   PORT=3001
   BEDROCK_ACCESS_KEY_ID=<your-access-key-id>
   BEDROCK_SECRET_ACCESS_KEY=<your-access-key>
   BEDROCK_REGION=<your-aws-region>
   BEDROCK_MODEL_ID=<-valid-bedrock-model-id>
   VITE_FALLBACK_EMAIL=<address-shown-when-the-contact-form-fails>
   ```

   Important: never commit API keys.

   - `VITE_`-prefixed variables are used by the frontend. Vite bakes them into the public site code when the dev server starts or the site builds, so restart/redeploy after changing one, and never give a secret the `VITE_` prefix.

4. **Run the dev servers**

   Run both the frontend (Vite) and backend (Express):

   ```bash
   npm run dev:full
   ```

   - Frontend: `http://localhost:8000`
   - Backend API: `http://localhost:3001`

   Or run them separately:

   ```bash
   npm run dev
   npm run server
   ```

## What the website does

- Renders a marketing/landing page for Mindfulness Labs.
- Provides a contact form for users to share their role and interest.
- Sends submissions to a backend API which stores the lead in Wix CRM.

## How the API is used (Wix CRM)

The logic lives in [server/lib/subscribe.js](server/lib/subscribe.js), served by [server/index.js](server/index.js) locally and [netlify/functions/subscribe.mjs](netlify/functions/subscribe.mjs) in production:

- `POST /api/subscribe`: Creates a Wix CRM contact from the submitted email and name, or updates it if the email already exists.
  - Saves the selected role into an extended field (custom field) in Wix.
  - Saves the newest message into a Wix extended field whose display name is **"Message from Landing"** (each submission overwrites it; the full history is in the contact's Inbox conversation).
  - Subscribes the email to Wix email marketing.
  - Posts the submission into the contact's Wix Inbox conversation.
  - On failure, the form asks the user to email `VITE_FALLBACK_EMAIL` directly.

### “Interest from Landing Page” logic

Wix CRM is set up to group contacts into a segment called **"Interest from Landing Page"** based on whether the contact has a message in the **"Message from Landing"** field.

To support that flow, the backend guarantees a message is always sent, for both new and returning contacts:

- If the user enters a message in the form, that message is stored.
- If the user leaves the message blank, the backend stores the default value: **"Interest from Landing Page"**. For a returning contact, this replaces their previous message in the field (it's still in their Inbox conversation).

## Available Scripts

- `npm run dev` - Start the development server with hot reload
- `npm run server` - Start the backend API server (Express)
- `npm run dev:full` - Run frontend + backend together
- `npm run build` - Build the project for production
- `npm run preview` - Preview the production build locally

## Deployment

The site is hosted on [Netlify](https://www.netlify.com/), a platform that builds and hosts the frontend directly from this GitHub repo.

Once Netlify is connected to this repository, deployment should automatic: **every push to `main` triggers a new production build and deploy**. No manual deploy step is needed — merging or pushing to `main` is the deploy.

Environment variables (e.g. `WIX_SITE_ID`, `WIX_API_KEY`, `BEDROCK_*`, `VITE_FALLBACK_EMAIL`) must be configured in the Netlify site settings, since the `.env` file is local-only and not committed to the repo. `VITE_` variables are baked in at build time, so trigger a redeploy after changing one.
