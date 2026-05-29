# Study Assistant NeoAI

An API-powered study assistant web app for working with uploaded notes and study files.

Study Assistant NeoAI helps students upload PDFs, notes, text files, and documents, then use API-based AI services to generate key concepts, formula sheets, MCQ quizzes, objective practice questions, and document-based chat responses. The app includes Google sign-in, guest mode, per-account file persistence, MCQ score history, a polished green dashboard, and support for Groq API with Gemini as an alternate provider.

## Features

- Upload PDFs, text files, notes, and documents
- AI chat grounded in uploaded study material
- Key concepts generation
- Formula sheet generation when applicable
- 10-question MCQ quiz generation
- Timed MCQ sessions
- MCQ score and time history
- Objective practice through chat
- Per-account saved uploads and study history
- Google sign-in using Google Identity Services
- Guest mode for temporary sessions
- Groq API support
- Gemini API support as an alternate provider
- API key settings page with show/hide key controls
- Uploaded file delete option
- Dashboard uploaded-file tracker
- Dark green responsive interface
- Light and dark mode support
- Local browser-based persistence

## Author

Isaac Gazula

## Installation

1. Install Node.js.

2. Clone or download this repository.

3. Open the project folder:

```powershell
cd "C:\Users\Example\Downloads\study-assistant-neoai-isaacg"
```

4. Run the local server:

```powershell
node server.mjs
```

5. Open the application:

```text
http://localhost:9011
```

## API Setup

The app uses API-based AI services. To use AI features, open the Settings page and paste an API key.

Groq API keys can be created here:

```text
https://console.groq.com/keys
```

Gemini API keys can be created here:

```text
https://aistudio.google.com/app/apikey
```

For best usage, upload smaller focused files or single chapters. Large files use more tokens and may reduce free API usage time.

## Usage

1. Open the application in the browser.
2. Continue with Google or use guest mode.
3. Add a Groq or Gemini API key in Settings.
4. Upload a study file from the Notes page.
5. Open Summaries and generate key concepts or a formula sheet.
6. Open Quiz and generate 10 MCQs from the uploaded file.
7. Answer the MCQs and review the score and time.
8. Use Objective Questions in Chat for short-answer practice.
9. Return later with the same Google account to restore saved files and history.

## Screenshots

Screenshots can be added here after portfolio capture.

## Project Architecture

- `index.html` contains the main application structure, authentication screen, dashboard, upload page, summaries page, quiz page, and settings page.
- `styles.css` contains the full responsive interface, dark/light theme styling, dashboard layout, cards, buttons, animations, and app polish.
- `app.js` handles authentication state, file uploads, local persistence, AI provider calls, summary generation, quiz generation, chat behavior, MCQ timing, and MCQ history.
- `server.mjs` starts the local Node.js server on port `9011`.
- `favicon.svg` contains the app tab icon.
- `README.md` documents the project for GitHub.

## Google Login

The app uses Google Identity Services for browser-based Google sign-in.

For local testing, the app runs at:

```text
http://localhost:9011
```

Signed-in users can restore uploaded files and history after refresh. Guest mode is temporary and does not save files permanently.

## Storage Notes

Study Assistant NeoAI stores user data locally in the browser.

- API keys are stored in browser local storage.
- Uploaded file data is saved per signed-in account when possible.
- Large files may be stored as extracted text only to avoid browser storage limits.
- Guest mode does not permanently save uploads or quiz history.
- Real API keys should never be committed into the source code.

## Future Upgrades

- Backend database storage
- Cloud file storage
- Stronger PDF parsing for large files
- OCR support for handwritten notes and scanned PDFs
- More quiz modes
- Flashcard generation
- Export summaries and quiz results
- Better markdown and math rendering
- Multi-device sync
- Deployment-ready OAuth configuration

## Branding

Application: Study Assistant NeoAI  
Created by: Isaac Gazula  
Version: 1.0  

© Study Assistant NeoAI. All Rights Reserved.
