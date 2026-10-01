interface Env {
  ASSETS: Fetcher;
  RESEND_API_KEY: string;
  // Workers Analytics Engine dataset (wrangler.toml). Optional so local tests and
  // deployments without the binding keep working.
  EVENTS?: AnalyticsEngineDataset;
}

type ContactFields = Record<string, string>;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact' && request.method === 'POST') {
      return handleContact(request, env);
    }
    if (url.pathname === '/api/event' && request.method === 'POST') {
      return handleEvent(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

// Events the site sends (src/components/Analytics.astro). Anything else is dropped.
const EVENT_NAMES = new Set([
  'pageview',
  'email_click',
  'app_store_click',
  'enter_site',
  'cta_header',
  'cta_footer',
  'cta_hero',
  'cta_testimonials',
  'cta_case_study',
  'cta_welcome_contact',
]);

function record(
  request: Request,
  env: Env,
  name: string,
  path: string,
  referrer = '',
  detail = '',
) {
  // Aggregate counts only: no IP address, user agent, or identifier is stored.
  const country = (request as Request & { cf?: { country?: string } }).cf?.country ?? '';
  try {
    env.EVENTS?.writeDataPoint({
      blobs: [name, path.slice(0, 200), referrer.slice(0, 100), country, detail.slice(0, 200)],
      doubles: [1],
      indexes: [name],
    });
  } catch (error) {
    console.error('Analytics write failed', error);
  }
}

async function handleEvent(request: Request, env: Env): Promise<Response> {
  const done = new Response(null, { status: 204 });
  if (/bot|crawler|spider|headless/i.test(request.headers.get('user-agent') ?? '')) return done;
  let event: { name?: unknown; path?: unknown; referrer?: unknown; detail?: unknown };
  try {
    event = JSON.parse(await request.text());
  } catch {
    return done;
  }
  const { name, path, referrer, detail } = event;
  if (typeof name !== 'string' || !EVENT_NAMES.has(name)) return done;
  if (typeof path !== 'string' || !path.startsWith('/')) return done;
  // Keep only the referring site, never the full URL.
  let referrerHost = '';
  try {
    const host = new URL(String(referrer)).hostname;
    if (host && host !== new URL(request.url).hostname) referrerHost = host;
  } catch {}
  record(request, env, name, path, referrerHost, typeof detail === 'string' ? detail : '');
  return done;
}

function isFormEncoded(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  return type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data');
}

async function readContact(request: Request): Promise<ContactFields | null> {
  try {
    if (isFormEncoded(request)) {
      const form = await request.formData();
      return Object.fromEntries(
        [...form.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : '']),
      );
    }
    const data = await request.json();
    return data && typeof data === 'object' ? (data as ContactFields) : null;
  } catch {
    return null;
  }
}

async function handleContact(request: Request, env: Env): Promise<Response> {
  // The page's script posts JSON and shows the result inline. Without
  // JavaScript the browser posts the form itself and gets a page back.
  const isFormPost = isFormEncoded(request);
  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const success = () =>
    isFormPost
      ? new Response(null, { status: 303, headers: { Location: '/contact/thanks/' } })
      : json({ success: true });
  const failure = (error: string, status: number) =>
    isFormPost ? errorPage(error, status) : json({ error }, status);

  const data = await readContact(request);
  if (!data) return failure('Invalid request', 400);

  const field = (key: string) => (typeof data[key] === 'string' ? data[key].trim() : '');
  const name = field('name');
  const email = field('email');
  const message = field('message');

  // Bot protection — silently succeed so bots don't know they were filtered
  if (field('_honeypot')) return success();

  // Validation
  if (!name || !email || !message) {
    return failure('All fields are required.', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return failure('Invalid email address.', 400);
  }
  if (name.length > 200 || email.length > 320 || message.length > 10_000) {
    return failure('That message is too long. Please shorten it or email us directly.', 400);
  }

  const context = [
    ['Company', field('company')],
    ['Project', field('service')],
    ['Budget', field('budget')],
    ['Timeline', field('timeline')],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value.slice(0, 200)}`);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Idle Fusion Contact <hello@idlefusion.com>',
      to: ['hello@idlefusion.com'],
      reply_to: email,
      subject: `New contact from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\n${message}${context.length ? `\n\n${context.join('\n')}` : ''}`,
    }),
  });

  if (!res.ok) {
    const resendError = await res.text();
    console.error('Resend error', res.status, resendError);
    return failure('Failed to send. Please try emailing us directly.', 500);
  }

  record(request, env, 'contact_submit', '/contact/', '', field('service'));
  return success();
}

function errorPage(error: string, status: number): Response {
  const escaped = error.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Message not sent — Idle Fusion</title><body style="font-family:system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 20px;line-height:1.6"><h1 style="font-weight:500">Your message wasn’t sent.</h1><p>${escaped}</p><p><a href="/contact/">Go back to the form</a> or email <a href="mailto:hello@idlefusion.com">hello@idlefusion.com</a>.</p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
