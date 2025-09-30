# digdat0 Computer Rankings

What This Is

This tool creates an independent ranking system for college football teams. Unlike traditional polls, which rely on human voters, our approach is fully data-driven. Every FBS team is ranked based on their performance to date, with all games (including FCS opponents) factored into the evaluation. The goal is to provide a fair, transparent, and objective look at which teams have truly earned their spot.

How We Calculate the Rankings

Our algorithm blends several factors into a single score for each team:
Win–Loss Record: Baseline measure of results on the field.
Game Results & Margin of Victory: Quality of wins and competitiveness of losses, with caps to avoid inflating blowouts.
Strength of Schedule (SOS): Adjusts for the difficulty of opponents played, including both FBS and FCS teams.
Quality & Recency: Wins against higher-ranked opponents are weighted more, with recent games carrying slightly more influence.
Top Wins: Credit is given for victories over Top 10, Top 25, and Top 50 teams.
Efficiency (Offense & Defense Ranks): Advanced metrics that reward balanced, sustainable performance, not just outcomes.
Each of these inputs is normalized and combined to produce a single composite score. Teams are then ordered by this score, giving you the current pecking order based purely on performance and context — no bias, no reputation, just the numbers.

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

<img width="1901" height="973" alt="image" src="https://github.com/user-attachments/assets/f02d6584-fae9-491d-a8b4-59d6718bf432" />
<img width="1889" height="973" alt="image" src="https://github.com/user-attachments/assets/43eb13fb-cbc9-419b-80c3-4ed7551bb805" />
<img width="1918" height="985" alt="image" src="https://github.com/user-attachments/assets/4332a1d4-1197-43c9-8767-e0ab913f02b2" />
<img width="1917" height="978" alt="image" src="https://github.com/user-attachments/assets/57c7a874-65c4-409c-adf5-739f0aa38d78" />
<img width="1920" height="991" alt="image" src="https://github.com/user-attachments/assets/76eb9542-d8bc-4919-a931-51c4b474d2ce" />
<img width="1920" height="991" alt="image" src="https://github.com/user-attachments/assets/a411d1ea-5d8a-4d62-809c-d0b8bdada7a4" />

