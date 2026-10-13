# Birthday Glow

A bilingual (English/Persian) animated birthday keepsake for Deniz, with a separate invitation-only editor and an unguessable link for the recipient view.

## Local development

Requires Node.js 22.13.x and pnpm 11.25.0. The app uses the managed MySQL database configured for the project. Keep account passwords and the editor setup code out of source files.

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run dev
```

The development command builds the frontend and starts the server on port 3000 (or `$PORT`). Create a static frontend bundle with:

```sh
pnpm run build
```

The built frontend is written to `dist/`. Production runs with `pnpm start`.

## The private editor

Open `/edit`. The first two people who know the private setup code can create separate editor accounts. Each person receives a random 12-digit account number and chooses an individual password of at least 12 characters. There is no open registration, and no third editor can be added. Keep the setup code private and share it with Deniz using a private channel; do not put it in the public birthday link.

The two editors can change the English and Persian birthday headline, note, secret reveal, heart phrases and palette. The date is fixed to October 30; the page does not display a birth year or age. The public URL reflects the latest settings after they are saved.

Use **Copy private birthday link** in the editor to create the viewer link. The invitation contains a high-entropy share token; visitors need that link to read the birthday content. The bare site address does not return personalized settings. Viewers do not need accounts and cannot edit.

## Deferred items

The user has paused all photo-gallery work. This version has no photo viewing, upload, storage, or deletion interface/API. Resume that work only if the user asks.

The default copy is specific to Deniz and available in English and Persian. It mentions her kindness, intelligence, style, makeup, cooking, colorful and mysterious sides, true-crime documentary nights, classic Persian music (Googoosh, Ebi and Namjoo), and the affectionate nickname «نردولک». It displays October 30 only and omits age and birth year. The requested Googoosh track **“Hamsafar”** is intentionally not embedded until its exact link is supplied.

The animated heart provides play, pause, restart and speed controls, honors reduced-motion preferences, supports keyboard focus and responds to English/Persian text direction.
