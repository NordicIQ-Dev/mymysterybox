// Email templates. Table-based with inline styles so they render in Gmail, Outlook and Apple Mail.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function layout(opts: { preheader: string; heading: string; body: string; ctaLabel?: string; ctaUrl?: string; footer: string }) {
  const cta = opts.ctaUrl && opts.ctaLabel
    ? `<tr><td style="padding:8px 32px 8px"><a href="${esc(opts.ctaUrl)}" style="display:inline-block;background:#F2EDE4;color:#0A0A0A;font-family:Arial,sans-serif;font-weight:600;font-size:15px;text-decoration:none;padding:16px 28px;border-radius:999px">${esc(opts.ctaLabel)}</a></td></tr>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#E9E5DE">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E9E5DE"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0A0A0A;border-radius:18px">
<tr><td style="padding:28px 32px 0;font-family:Arial,sans-serif;font-weight:600;font-size:15px;color:#F2EDE4">MyMysteryBox</td></tr>
<tr><td style="padding:24px 32px 8px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:38px;line-height:1.02;color:#F2EDE4">${esc(opts.heading)}</td></tr>
<tr><td style="padding:8px 32px 16px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#B5AEA2">${opts.body}</td></tr>
${cta}
<tr><td style="padding:16px 32px 32px;font-family:Arial,sans-serif;font-size:13px;line-height:1.55;color:#8E877C">${opts.footer}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 8px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#6E685E">
${esc(Deno.env.get("COMPANY_FOOTER") ?? "[COMPANY NAME] OÜ, [ADDRESS], Estonia")}
</td></tr></table>
</td></tr></table></body></html>`;
}

export function confirmationEmail(p: { firstName?: string | null; prizeName?: string | null; confirmUrl: string; unsubscribeUrl: string; giveawayEntered: boolean }) {
  const hi = p.firstName ? `Hi ${esc(p.firstName)}, thanks` : "Thanks";
  const prizeLine = p.giveawayEntered && p.prizeName
    ? ` Confirm your email to lock in your entry for <strong style="color:#F2EDE4">${esc(p.prizeName)}</strong>.`
    : " Confirm your email so we can tell you the moment we launch.";
  const subject = p.giveawayEntered && p.prizeName ? `Confirm your entry for ${p.prizeName}` : "Confirm your spot on the MyMysteryBox list";
  const html = layout({
    preheader: "One click and you're in.",
    heading: "One click and you're in.",
    body: `${hi} for joining the MyMysteryBox waitlist.${prizeLine}`,
    ctaLabel: p.giveawayEntered ? "Confirm my entry" : "Confirm my email",
    ctaUrl: p.confirmUrl,
    footer: `The link works for 7 days. If you didn't sign up, ignore this email and nothing happens.<br><br>Button not working? Paste this into your browser:<br><a href="${esc(p.confirmUrl)}" style="color:#E6CFA4;word-break:break-all">${esc(p.confirmUrl)}</a><br><br><a href="${esc(p.unsubscribeUrl)}" style="color:#E6CFA4">Unsubscribe</a>`,
  });
  const text = `${p.firstName ? `Hi ${p.firstName}, thanks` : "Thanks"} for joining the MyMysteryBox waitlist.\n\nConfirm your email here (valid for 7 days):\n${p.confirmUrl}\n\nDidn't sign up? Ignore this email.\nUnsubscribe: ${p.unsubscribeUrl}`;
  return { subject, html, text };
}

export function alreadyInEmail(p: { unsubscribeUrl: string }) {
  const html = layout({
    preheader: "Good news: you're already on the list.",
    heading: "You're already on the list.",
    body: "Someone (hopefully you) just tried to sign this address up again. You're already confirmed, so there's nothing more to do. We'll email you when we launch.",
    footer: `Didn't try to sign up? You can ignore this email.<br><br><a href="${esc(p.unsubscribeUrl)}" style="color:#E6CFA4">Unsubscribe</a>`,
  });
  const text = `You're already on the MyMysteryBox list. Nothing more to do.\n\nUnsubscribe: ${p.unsubscribeUrl}`;
  return { subject: "You're already on the MyMysteryBox list", html, text };
}
