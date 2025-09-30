
# digdat0 Computer Rankings

This version includes:
- Data Download tab (season JSON saved locally)
- Compare Teams tab (`/teams/matchup` on-demand)
- **Rankings tab** (BCS-style, computed locally from downloaded JSON)

See Phase 1 README for setup. In short:
```bash
cp server/.env.example server/.env
# add CFBD_API_KEY
npm install
npm run dev
```

Open the app, download data for 2025, then visit **Rankings**.
