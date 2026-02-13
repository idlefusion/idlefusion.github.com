# Cloudflare Workers Migration Checklist

## Before Merge

### 1. Create Cloudflare API Token
- Go to **Cloudflare Dashboard > My Profile > API Tokens > Create Token**
- Permissions needed:
  - `Zone : DNS : Edit`
  - `Account : Cloudflare Workers Scripts : Edit`
- Scope it to the `idlefusion.com` zone and your account

### 2. Gather IDs
- **Account ID**: Dashboard > Workers & Pages > right sidebar
- **Zone ID**: Dashboard > idlefusion.com > Overview > right sidebar

### 3. Add GitHub Repository Secrets
Go to **Settings > Secrets and variables > Actions** and add:
- `CLOUDFLARE_API_TOKEN` — the token from step 1
- `CLOUDFLARE_ACCOUNT_ID` — the account ID from step 2

### 4. Run DNS Setup
Point the domain at Cloudflare Workers:
```bash
export CF_API_TOKEN="<your-token>"
export CF_ZONE_ID="<your-zone-id>"
npm run dns:setup
```
This creates CNAME records for `idlefusion.com` and `www.idlefusion.com` pointing to the Workers route.

### 5. Test a Manual Deploy
From this branch, run:
```bash
npm run deploy
```
Confirm that `https://idlefusion.com` loads correctly from Cloudflare Workers.

## After Merge

### 6. Verify CI/CD
- The push to `master` triggers `.github/workflows/deploy-cloudflare.yml`
- Check the **Actions** tab to confirm the deploy succeeds

### 7. Disable GitHub Pages
- Go to **Settings > Pages > Source > None**
- This prevents the old `deploy.yml` workflow from deploying to a now-unused target

### 8. Delete the Old Workflow
Remove `.github/workflows/deploy.yml` since GitHub Pages is no longer used.

## Timing Notes
- Steps 4 and 5 should happen **before** merge so there is no downtime gap
- DNS propagation through Cloudflare's proxy is near-instant since the nameservers are already on Cloudflare
- The cutover: the old site serves until the CNAME records update, then Workers takes over
- Expected downtime is seconds, not minutes
