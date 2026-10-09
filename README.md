# Z-Notes

Z-Notes is a private AI note generator that produces structured study notes using real web research and reliable sources.

## Features

- Generate notes from topics, questions, or uploaded study materials
- Structured Markdown notes with headings, definitions, summaries, and revision questions
- Real web research through Tavily
- Clickable citations tied to retrieved sources
- Server-side AI provider failover:
  - Groq
  - Google Gemini
  - Kilo AI Gateway
- Persistent notes, research history, and preferences using Vercel Postgres / Neon
- Light and dark themes
- No authentication, accounts, payments, or subscriptions

## Setup

Install dependencies:

npm install

Copy environment example:

cp .env.example .env.local

Run locally:

npm run dev

Open:

http://localhost:3000

## Required environment variables

At minimum, configure:

POSTGRES_URL
GROQ_API_KEY
GEMINI_API_KEY
TAVILY_API_KEY

Optional Kilo support:

KILO_API_KEY
KILO_MODEL

## Gemini model note

This project uses the exact Gemini model ID:

gemini-3.8-flash

If that model is unavailable, the app reports the issue and fails over. It does not silently substitute another model.

## Build

npm run build
npm start

## Vercel deployment

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. Import the repository into Vercel.
3. Add a Vercel Postgres / Neon database.
4. Add the environment variables from .env.example.
5. Deploy.

Because this app has no authentication, protect the deployment using Vercel Deployment Protection, Vercel Firewall, IP restrictions, or a private network/VPN if it should not be publicly reachable.
