import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Gecersiz JSON' });
  }

  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers['paddle-signature'];
    if (!signature) return res.status(401).json({ error: 'Imza yok' });

    const parts = Object.fromEntries(
      signature.split(';').map(p => {
        const idx = p.indexOf('=');
        return [p.slice(0, idx), p.slice(idx + 1)];
      })
    );
    const ts = parts['ts'];
    const h1 = parts['h1'];
    if (!ts || !h1) return res.status(401).json({ error: 'Gecersiz imza formati' });

    const signedPayload = `${ts}:${rawBody}`;
    const expectedHash = createHmac('sha256', secret).update(signedPayload).digest('hex');

    try {
      const valid = timingSafeEqual(
        Buffer.from(h1, 'hex'),
        Buffer.from(expectedHash, 'hex')
      );
      if (!valid) return res.status(401).json({ error: 'Gecersiz imza' });
    } catch {
      return res.status(401).json({ error: 'Imza dogrulama hatasi' });
    }
  }

  const eventType = event.event_type || event.notification_type;
  console.log('Paddle webhook alindi:', eventType);

  try {
    if (
      eventType === 'subscription.activated' ||
      eventType === 'subscription.updated' ||
      eventType === 'subscription.created'
    ) {
      const email =
        event.data?.customer?.email ||
        event.data?.items?.[0]?.price?.custom_data?.email ||
        event.customer_email;

      console.log('Email:', email);

      if (email) {
        const { data: profile } = await sb
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (profile?.id) {
          await sb.from('profiles').update({
            is_pro: true,
            pro_since: new Date().toISOString()
          }).eq('id', profile.id);
          console.log('Pro yapildi:', email);
        } else {
          const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const user = authData?.users?.find(u => u.email === email);
          if (user) {
            await sb.from('profiles').upsert({
              id: user.id,
              email: email,
              is_pro: true,
              pro_since: new Date().toISOString()
            }, { onConflict: 'id' });
            console.log('Upsert pro yapildi:', email);
          }
        }
      }
    }

    if (
      eventType === 'subscription.canceled' ||
      eventType === 'subscription.paused'
    ) {
      const email = event.data?.customer?.email || event.customer_email;
      if (email) {
        const { data: profile } = await sb
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        if (profile?.id) {
          await sb.from('profiles').update({ is_pro: false }).eq('id', profile.id);
          console.log('Pro kaldirildi:', email);
        }
      }
    }
  } catch (err) {
    console.error('Webhook hatasi:', err);
  }

  res.status(200).json({ received: true });
}
