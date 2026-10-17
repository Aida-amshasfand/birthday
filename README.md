# Birthday Glow — Cloudflare Workers edition

This is the Cloudflare Workers version of the bilingual English/Persian birthday page. It keeps the invitation-only editor, private share link, personalized message, themes, and animated heart. The photo gallery remains paused and is not included.

The app uses a Cloudflare Worker and a new D1 database. This is a separate deployment from the Manus-hosted version: Manus accounts, saved settings, and the previous share link do not transfer automatically. The two editor accounts must be created again after deployment.

## Requirements

Install Node.js 22.13.x and create a Cloudflare account if you do not already have one. These instructions use `npm.cmd` and `npx.cmd` in PowerShell to avoid the PowerShell script-execution-policy error you encountered.

## 1. Open the project in VS Code

Extract this folder to a new location, open the folder in VS Code, and open **Terminal → New Terminal**. If PowerShell is not already in the project folder, change to it (adjust the path to where you extracted the download):

```powershell
cd "C:\Users\YOUR-NAME\Downloads\birthdayglow-workers"
```

Confirm Node and install the project dependencies:

```powershell
node --version
npm.cmd --version
npm.cmd install
```

## 2. Sign in and create the D1 database

Sign in to Cloudflare through the browser window Wrangler opens:

```powershell
npx.cmd wrangler login
```

Create a new database:

```powershell
npx.cmd wrangler d1 create birthday-glow-db
```

The command prints a `database_id`. In VS Code, open `wrangler.jsonc`, replace the placeholder `00000000-0000-0000-0000-000000000000` with the printed ID, and save. Keep the JSON quotation marks around the ID.

## 3. Set the local editor setup code

Apply the database schema to Wrangler's **local-only** database:

```powershell
npm.cmd run db:local
```

Create a local secret file from the example and edit it:

```powershell
Copy-Item .dev.vars.example .dev.vars
notepad .dev.vars
```

Replace the sample value with a long, private setup code, then save. This code is not the two editor passwords. Do not commit `.dev.vars` or share the setup code in a public message; Git ignores the file.

## 4. Run the site locally

```powershell
npm.cmd run dev
```

Open **http://localhost:8787/edit**. Use the setup code to create up to two separate editor accounts. Each editor receives a 12-digit account number and chooses an individual password. From the editor, copy the private birthday link. The link from local development works only on your computer; deployment creates a different link.

Stop the local server with **Ctrl+C** in the VS Code terminal.

## 5. Deploy to Cloudflare Workers

First apply the schema to the remote D1 database:

```powershell
npm.cmd run db:remote
```

Build and deploy the Worker plus its static site files:

```powershell
npm.cmd run deploy
```

The first version has no editor setup code yet, so account registration stays disabled. Add the code as a Cloudflare secret:

```powershell
npx.cmd wrangler secret put BIRTHDAY_SETUP_CODE
```

When prompted, enter the private code you chose for local development. Wrangler publishes a new Worker version with that secret. Use the `workers.dev` URL Wrangler reports, then open `/edit` to create the two editor accounts. Copy the new private birthday link from the deployed editor and send it to Deniz.

## Updating the deployed site

After editing the source, deploy the updated Worker with:

```powershell
npm.cmd run deploy
```

If you later add a migration under `migrations/`, apply it to the remote database before deploying code that depends on it:

```powershell
npm.cmd run db:remote
npm.cmd run deploy
```

## Privacy and data

Anyone with the private birthday link can view the birthday page; only the two invitation-only editor accounts can change it. The public base address does not return personalized settings. Keep your Cloudflare account, setup code, and editor passwords private. Keep the GitHub repository private too, because the source includes personalized birthday messages.

This Worker uses a **new D1 database**. Existing Manus accounts, saved settings, and share links are not automatically copied. Keep your previous project until you have checked the new Worker. This version has no gallery viewing, upload, storage, or deletion feature, as requested.

## References

- [Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
