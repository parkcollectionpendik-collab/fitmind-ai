import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Paddle imza doğrulaması
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers['paddle-signature'];
    if (!signature) return res.status(401).json({ error: 'İmza yok' });

    // Paddle imza formatı: ts=timestamp;h1=hash
    const parts = Object.fromEntries(signature.split(';').map(p => p.split('=')));
    const ts = parts['ts'];
    const h1 = parts['h1'];

    if (!ts || !h1) return res.status(401).json({ error: 'Geçersiz imza formatı' });

    // İmzayı doğrula
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const signedPayload = `${ts}:${body}`;
    const expectedHash = createHmac('sha256', secret).update(signedPayload).digest('hex');

    try {
      const valid = timingSafeEqual(Buffer.from(h1), Buffer.from(expectedHash));
      if (!valid) return res.status(401).json({ error: 'Geçersiz imza' });
    } catch {
      return res.status(401).json({ error: 'İmza doğrulama hatası' });
    }
  }

  const event = req.body;
  const eventType = event.event_type || event.notification_type;

  try {
    // Abonelik aktive edildi veya güncellendi
    if (
      eventType === 'subscription.activated' ||
      eventType === 'subscription.updated' ||
      eventType === 'subscription.created'
    ) {
      const email =
        event.data?.customer?.email ||
        event.data?.items?.[0]?.price?.custom_data?.email ||
        event.customer_email;

      if (email) {
        // E-posta ile kullanıcı ID'sini bul
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
        } else {
          // profiles'da email yoksa auth'dan bak
          const { data: authData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const user = authData?.users?.find(u => u.email === email);
          if (user) {
            await sb.from('profiles').upsert({
              id: user.id,
              is_pro: true,
              pro_since: new Date().toISOString()
            }, { onConflict: 'id' });
          }
        }
      }
    }

    // Abonelik iptal edildi
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
        }
      }
    }

  } catch (err) {
    console.error('Webhook işleme hatası:', err);
    // 200 dön ki Paddle tekrar denemesin
  }

  res.status(200).json({ received: true });
}
