# NextPlay Kanban Board

A polished sticky-note Kanban board built with React, TypeScript, and Supabase.

## Features

- Drag-and-drop Kanban columns with automatic priority ordering
- Guest/anonymous Supabase auth
- Direct Supabase persistence from the frontend
- Stable sticky-note colors with priority-based shading
- Due date indicators on cards
- Search and filtering by title, priority, assignee, and label
- Team members and assignees
- Labels and tags
- Task comments
- Task activity log
- Board summary stats

## Tech Stack

- React 19
- TypeScript
- Vite
- Supabase
- Vitest + Testing Library

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file using `.env.example`.

3. Add your Supabase values:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

4. Run the advanced feature SQL in Supabase:

- Open the Supabase SQL editor
- Run [`supabase/advanced_features.sql`](D:/Projects/NextPlay/supabase/advanced_features.sql)

5. Start the app:

```bash
npm run dev
```

## Scripts

- `npm run dev` starts the Vite dev server
- `npm run build` creates a production build
- `npm run test` runs the frontend test suite

## Notes

- The Supabase URL and anon key are safe to use in the frontend, but security must rely on RLS policies.
- Do not commit your service role key or database password.
- The advanced features require the extra tables from `supabase/advanced_features.sql`.

## Verification

The app was verified with:

- `npx tsc --noEmit`
- `npm run test:web`
- `npm run build`

There was also a live Supabase smoke test covering:

- task create
- team member create
- label create
- comment create
- activity create
- assignee linking
- label linking
