# Analytics

The site counts page views and conversions without cookies or personal data, so no consent banner is needed.

## How it works

- `src/components/Analytics.astro` (included by `SiteLayout`, `BaseLayout`, and the welcome page) sends one small beacon to `/api/event` for each page view and for these clicks:

  | Event | When |
  | --- | --- |
  | `pageview` | Every page load |
  | `email_click` | Any `mailto:` link |
  | `app_store_click` | Any App Store link (detail: the store URL) |
  | `enter_site` | "Come on in" on the welcome screen |
  | `cta_welcome_contact` | "Start a project" on the welcome screen |
  | `cta_header`, `cta_footer`, `cta_hero`, `cta_testimonials`, `cta_case_study` | Contact links, by placement |

- `worker.ts` also records `contact_submit` itself after the email is delivered, so form conversions are counted even if a beacon is blocked.
- Visitors with Global Privacy Control or Do Not Track turned on send nothing. Requests from obvious bots are dropped.
- Each data point stores: event name, page path, referring site (host name only), country, and an optional detail. No IP address, user agent, or identifier is stored.

To add an event, put `data-track="event_name"` on a link or button and add the name to `EVENT_NAMES` in `worker.ts`.

## Storage

Events go to the Workers Analytics Engine dataset `idlefusion_events` (binding `EVENTS` in `wrangler.toml`). The dataset is created on the first `npm run deploy`. If the deploy reports that Analytics Engine is not enabled, enable it once under **Workers & Pages → Analytics Engine** in the Cloudflare dashboard.

Columns: `blob1` event, `blob2` path, `blob3` referrer host, `blob4` country, `blob5` detail, `double1` count.

## Querying

Use the [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) with an API token that has **Account Analytics: Read**:

```sh
curl "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d "SELECT blob1 AS event, SUM(_sample_interval) AS count
      FROM idlefusion_events
      WHERE timestamp > NOW() - INTERVAL '30' DAY
      GROUP BY event ORDER BY count DESC"
```

Useful queries:

```sql
-- Page views by page, last 30 days
SELECT blob2 AS path, SUM(_sample_interval) AS views
FROM idlefusion_events
WHERE blob1 = 'pageview' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY path ORDER BY views DESC

-- Welcome screen: how many visitors go on to the full site or to contact
SELECT blob1 AS event, SUM(_sample_interval) AS count
FROM idlefusion_events
WHERE blob2 = '/' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY event

-- Where contact conversions start (which call to action)
SELECT blob1 AS event, blob2 AS path, SUM(_sample_interval) AS clicks
FROM idlefusion_events
WHERE blob1 LIKE 'cta_%' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY event, path ORDER BY clicks DESC

-- Top referring sites
SELECT blob3 AS referrer, SUM(_sample_interval) AS views
FROM idlefusion_events
WHERE blob1 = 'pageview' AND blob3 != '' AND timestamp > NOW() - INTERVAL '30' DAY
GROUP BY referrer ORDER BY views DESC
```

Analytics Engine keeps data for three months. For a ready-made traffic dashboard as well, turn on **Web Analytics** for idlefusion.com in the Cloudflare dashboard; it is also cookieless.
