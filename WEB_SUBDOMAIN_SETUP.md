# Set up web.truesitesync.com (Option B — second GitHub Pages repo)

The main site stays exactly as-is on `truesitesync.com`. This adds a second
GitHub Pages site at **web.truesitesync.com** that auto-mirrors the main site on
every push (via `.github/workflows/deploy-web.yml`).

## One-time steps (you do these — they need GitHub/DNS access)

### 1. Create the second repo
- GitHub → New repository → name: **`truesitesync-web`** → **Public** → Create.
  (Leave it empty — no README.)

### 2. Create a deploy token
- GitHub → Settings → Developer settings → **Personal access tokens**.
  - Classic: scope **`repo`**.
  - or Fine-grained: repository **truesitesync-web**, permission **Contents: Read and write**.
- Copy the token.

### 3. Add the token as a secret in THIS repo
- `truesitesync` repo → Settings → Secrets and variables → Actions → **New repository secret**
  - Name: **`WEB_DEPLOY_TOKEN`**
  - Value: (the token)

### 4. Trigger the mirror
- `truesitesync` repo → Actions → **"Mirror to web.truesitesync.com"** → **Run workflow**
  (or just push any commit to `main`).
- This creates a `gh-pages` branch in `truesitesync-web` with the full site +
  a `CNAME` file containing `web.truesitesync.com`.

### 5. Turn on Pages for the second repo
- `truesitesync-web` repo → Settings → **Pages** → Source = **Deploy from a branch** → Branch **`gh-pages`** / `/ (root)` → Save.
- It should auto-detect the custom domain `web.truesitesync.com` from the CNAME file.

### 6. Add the DNS record
At your domain DNS (registrar / Cloudflare), add:

| Type  | Name | Value                         |
|-------|------|-------------------------------|
| CNAME | web  | `raghusoftware.github.io`     |

(If your registrar requires it, use `web.truesitesync.com` as the host/name.)

### 7. Wait & verify
- DNS + GitHub TLS take ~10–30 min. Then open **https://web.truesitesync.com** — it serves the same app.
- Enable "Enforce HTTPS" in the second repo's Pages settings once the cert is issued.

## Notes
- After this, every push to `main` updates BOTH `truesitesync.com` and `web.truesitesync.com` automatically — no double maintenance.
- The mirror excludes `.github`, `tests`, and package files.
- Want `web.truesitesync.com` to open the **app** directly (instead of the landing page)? Tell me and I'll add a redirect/entry for the web build.
