export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const firstName = (name || 'Sporcu').split(' ')[0];

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#f5f2eb">
  <div style="max-width:560px;margin:0 auto;padding:2rem 1.5rem">

    <div style="text-align:center;margin-bottom:2rem;padding-bottom:1.5rem;border-bottom:1px solid #ffffff15">
      <span style="font-size:1.3rem;font-weight:800">Fit<span style="color:#c8f542">Mind</span> AI</span>
    </div>

    <div style="background:#1a0a00;border:1px solid #f5a62325;border-radius:16px;padding:2rem;text-align:center;margin-bottom:1.5rem">
      <div style="font-size:3rem;margin-bottom:0.75rem">💪</div>
      <h1 style="font-size:1.4rem;font-weight:800;margin:0 0 0.5rem;color:#f5f2eb">${firstName}, seni ozledik!</h1>
      <p style="color:#888;font-size:0.9rem;margin:0;line-height:1.6">3 gundur gorunmedin. Planin seni bekliyor.</p>
    </div>

    <div style="background:#111;border:1px solid #ffffff0f;border-radius:16px;padding:1.5rem;margin-bottom:1.5rem">
      <div style="font-size:0.75rem;color:#f5a623;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.75rem">NEDEN DEVAM ETMELISIN?</div>
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
        <span style="font-size:1.2rem">🔥</span>
        <span style="font-size:0.88rem;color:#ffffffcc">Serini kaybetme — her gün biraz daha güçleniyorsun</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
        <span style="font-size:1.2rem">🎯</span>
        <span style="font-size:0.88rem;color:#ffffffcc">Hedefine ulasmanin en kisa yolu tutarlilik</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        <span style="font-size:1.2rem">🤖</span>
        <span style="font-size:0.88em;color:#ffffffcc">AI kocun 7/24 hazir, sadece bir mesaj yaz</span>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:1.5rem">
      <a href="https://fitmindai.ai/dashboard.html" style="display:inline-block;background:#c8f542;color:#000;text-decoration:none;padding:0.9rem 2rem;border-radius:100px;font-weight:800;font-size:0.95rem">Hemen Devam Et 🚀</a>
    </div>

    <div style="background:#0d1a05;border:1px solid #c8f54215;border-radius:12px;padding:1.2rem;margin-bottom:1.5rem;text-align:center">
      <div style="font-size:0.85rem;color:#888;line-height:1.6;margin-bottom:0.5rem">Bugun sadece <strong style="color:#f5f2eb">20 dakika</strong> yeterli. AI kocuna "bugun ne yapmam lazim" yaz, o halleder.</div>
    </div>

    <div style="text-align:center;padding-top:1.5rem;border-top:1px solid #ffffff10">
      <p style="color:#555;font-size:0.75rem;margin:0">FitMind AI &middot; <a href="https://fitmindai.ai" style="color:#555;text-decoration:none">fitmindai.ai</a></p>
      <p style="color:#444;font-size:0.72rem;margin:0.4rem 0 0">Bu emaili almak istemiyorsan <a href="https://fitmindai.ai/unsubscribe.html" style="color:#444">buraya tikla</a></p>
    </div>

  </div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'FitMind AI <coach@fitmindai.ai>',
        to: email,
        subject: `${firstName}, 3 gundur gorunmedin 👀`,
        html
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Resend error' });
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
