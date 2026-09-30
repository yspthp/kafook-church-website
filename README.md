# 五旬節聖潔會迦福堂網站

Ka Fook Pentecostal Holiness Church website.

## Deployment

GitHub Pages publishes the root of the `main` branch. No build step is required.
The `.nojekyll` file preserves the plain static HTML, CSS, JavaScript and image assets.

## Local preview

Serve this directory with a static HTTP server and open `index.html`.

## Integrations

- Public pages are static, with relative asset paths for GitHub project Pages.
- Member sign-in and the staff interface use the existing Supabase browser integration.
- The browser configuration contains only a public anonymous key. Database and storage access must be protected by Supabase RLS. Never add service-role keys or credentials.
- The contact form creates an email draft; it does not send or store messages automatically.

## Updating

Commit reviewed website files to `main`; GitHub Pages redeploys automatically.
Internal working notes, source audit documents and previous development history are intentionally excluded.
