## Email Find Agent

A prospecting assistant that scans a company domain, scrapes lightweight public pages, and surfaces verified email addresses plus naming-pattern guesses for outreach. Built with Next.js App Router, Tailwind CSS, and an edge-ready API route.

### Features

- Crawls curated pages such as `/contact`, `/team`, and keyword-specific paths.
- Extracts `mailto:` links and unstructured email text with contextual snippets.
- Scores each match by confidence and shows where it was discovered.
- Generates pattern-based suggestions (e.g., `first.last@domain.com`) for new contacts.
- Provides quick copy-to-clipboard actions and a visual request timeline.

### Running Locally

```bash
npm install
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000) and enter a company domain. Add optional first/last names or department keywords to refine pattern guesses.

### Production Build

```bash
npm run build
npm start
```

The project is optimized for deployment on Vercel and uses only server-side network access in the `/api/lookup` route.
