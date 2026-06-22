# Netlify Environment Variables

The site includes safe defaults for testing, but production should use Netlify environment variables.

Set these in Netlify under Site configuration → Environment variables:

```text
SUPABASE_URL=https://lcofklilvaatcorvfucz.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=paste-service-role-key-in-netlify-only
EMAILJS_PUBLIC_KEY=your-emailjs-public-key
EMAILJS_SERVICE_ID=your-emailjs-service-id
EMAILJS_ORDER_TEMPLATE_ID=your-emailjs-order-template-id
OWNER_EMAIL=info@soltides.co
BITCOIN_ADDRESS=your-btc-address
TURNSTILE_SITE_KEY=paste-cloudflare-turnstile-site-key
TURNSTILE_SECRET_KEY=paste-cloudflare-turnstile-secret-key
```

Never put the service role key in browser files or chat.

Checkout intentionally remains disabled until both Turnstile variables and the
Supabase service-role key are configured. Then run `supabase-next-step.sql` in
Supabase to remove the legacy anonymous insert policies.
