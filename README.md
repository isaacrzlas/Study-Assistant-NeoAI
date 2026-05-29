# Neo AI Study Assistant

Neo AI is a modern AI-powered study assistant built to help students upload notes, generate summaries, create quizzes, and chat with their study material.

Made by Isaac Gazula.

## Features

- Google sign-in and guest mode
- Per-account saved uploads and study history
- Upload PDFs, text files, notes, and documents
- AI chat grounded in uploaded files
- Key concepts and formula sheet generation
- 10-question MCQ quiz generation
- Objective practice in chat
- MCQ score and time history
- Groq API support with Gemini as an alternate provider
- Dark green premium UI with responsive dashboard

## Tech Stack

- HTML
- CSS
- JavaScript
- Node.js local server
- Google Identity Services
- Groq API
- Gemini API

## How To Run Locally

1. Clone or download the project.

2. Open the project folder:

```powershell
cd "C:\Users\isaac\Documents\Codex\2026-05-29\study-assistant-neoai-isaacg"
```

3. Start the local server:

```powershell
node server.mjs
```

4. Open the app:

```text
http://localhost:9011
```

## API Setup

Neo AI supports Groq and Gemini.

To use AI features, open the Settings page in the app and paste your API key.

Get a Groq API key:

```text
https://console.groq.com/keys
```

Get a Gemini API key:

```text
https://aistudio.google.com/app/apikey
```

For best usage, upload smaller focused files or single chapters. Large files use more tokens.

## Google Login

The app uses Google Identity Services for Google sign-in.

For local testing, the app is configured for:

```text
http://localhost:9011
```

## Notes

- Guest mode is temporary and does not save files.
- Signed-in users can restore uploaded files and history after refresh.
- API keys are stored locally in the browser.
- Do not commit real API keys into the source code.

## License

All rights reserved.

Copyright 2026 Neo AI.
=======
# Study-Assistant-NeoAI
A study assistant web app powered by NeoAI (API-based AI) services for generating summaries, quizzes, objective practice, and document-based chat from uploaded notes and files. Built to support per-account persistence, Google login, and a polished dashboard workflow.
>>>>>>> e5c3fd0286ed00e70500104ec59c308b700d34d4
