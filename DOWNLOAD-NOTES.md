# Birthday Glow download

This archive contains the complete committed project source and a prebuilt copy of the frontend in `dist/`.

## Build and run

Requires Node.js 22.13.x and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run dev
```

The server uses MySQL. A standalone deployment must provide `DATABASE_URL` for its MySQL database and a private `BIRTHDAY_SETUP_CODE` for the two editor registrations. `PORT` is optional (defaults to 3000). No credentials, editor passwords, database contents, dependencies, or Git history are included in this ZIP. Keep any secrets out of source control.

The photo gallery is paused and is not included in this version. The exact audio link for “Hamsafar” is still pending.
