import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body;

  if (event.event_type === 'subscription.activated' || 
      event.event_type === 'subscription.updated') {
    const email = event.data?.customer?.email;
    if (email) {
      const { data: users } = await sb.auth.admin.listUsers();
      const user = users?.users?.find(u => u.email === email);
      if (user) {
        await sb.from('profiles').update({ is_pro: true }).eq('id', user.id);
      }
    }
  }

  res.status(200).json({ received: true });
}
