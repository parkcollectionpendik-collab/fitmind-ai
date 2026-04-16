import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export const config = {
  api: { bodyParser: false },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function updateProStatus(email, isPro) {
  if (!email) return;
  const { data: profile } = await sb
    .from('profiles').select('id').eq('email', email).maybeSingle();
  if (profile?.id) {
    await sb.from('profiles').update({
      is_pro: isPro,
      ...(isPro ? { pro_since: new Date().toISOString() } : {})
    }).eq('id', profile.id);
    console.log(`${email} -> is_pro: ${isPro}`);
  } else {
    const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = authData?.users?.find(u => u.email === email);
    if (user) {
      await sb.from('profiles').upsert({
        id: user.id, email,
        is_pro: isPro,
        ...(isPro ? { pro_since: new Date().toISOString() } : {})
      }, { onConflict: 'id' });
      console.log(`${email} upsert -> is_pro: ${isPro}`);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  let event;
  try { event = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers['paddle-signature'];
    if (!signature) return res.status(401).json({ error: 'No signature' });
    const parts = Object.fromEntries(
      signature.split(';').map(p => { const i = p.indexOf('='); return [p.slice(0,i), p.slice(i+1)]; })
    );
    const { ts, h1 } = parts;
    if (!ts || !h1) return res.status(401).json({ error: 'Invalid signature format' });
    const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
    try {
      if (!timingSafeEqual(Buffer.from(h1, 'hex'), Buffer.from(expected, 'hex')))
        return res.status(401).json({ error: 'Invalid signature' });
    } catch { return res.status(401).json({ error: 'Signature error' }); }
  }

  const eventType = event.event_type || event.notification_type;
  const email = event.data?.customer?.email || event.customer_email;
  const status = event.data?.status;

  console.log('Webhook:', eventType, 'email:', email, 'status:', status);

  try {
    if (eventType === 'subscription.activated' || eventType === 'subscription.created') {
      await updateProStatus(email, true);
    }
    else if (eventType === 'subscription.updated') {
      // status: active/trialing = pro, canceled/paused = not pro
      if (status === 'active' || status === 'trialing') {
        await updateProStatus(email, true);
      } else if (status === 'canceled' || status === 'paused') {
        await updateProStatus(email, false);
      }
    }
    else if (eventType === 'subscription.canceled' || eventType === 'subscription.paused') {
      await updateProStatus(email, false);
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }

  res.status(200).json({ received: true });
}
