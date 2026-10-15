import { secureRandomInt, unsubscribeSig, verifyUnsubscribeSig, sha256Hex } from "../supabase/functions/_shared/util.ts";
import { sendEmail } from "../supabase/functions/_shared/email.ts";
import { confirmationEmail } from "../supabase/functions/_shared/templates.ts";
Deno.env.set("UNSUBSCRIBE_SECRET","s3cret"); Deno.env.set("BREVO_API_KEY","k"); Deno.env.set("EMAIL_FROM","hello@x.com");
Deno.test("random uniform-ish", () => { const c=[0,0,0]; for(let i=0;i<30000;i++) c[secureRandomInt(3)]++; for (const n of c) if (n<9500||n>10500) throw new Error(String(c)); });
Deno.test("hmac", async () => { const id="11111111-1111-1111-1111-111111111111"; const s=await unsubscribeSig(id); if(!(await verifyUnsubscribeSig(id,s))) throw 1; if(await verifyUnsubscribeSig(id,s.replace(/.$/,"0"))&&!s.endsWith("0")) throw 2; });
Deno.test("sha", async () => { if ((await sha256Hex("abc")) !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throw 1; });
Deno.test("brevo sandbox header in body", async () => {
  Deno.env.set("EMAIL_MODE","sandbox"); let body:any;
  globalThis.fetch = (async (_u:any, init:any) => { body = JSON.parse(init.body); return new Response(JSON.stringify({messageId:"m1"}),{status:201}); }) as any;
  const t = confirmationEmail({confirmUrl:"https://a/confirm?token=x",unsubscribeUrl:"https://a/u",giveawayEntered:true,prizeName:"Box <b>"});
  const r = await sendEmail({to:"a@b.com",tag:"confirmation",unsubscribeUrl:"https://f/u",...t});
  if (r.status!=="sent"||body.headers["X-Sib-Sandbox"]!=="drop"||!body.headers["List-Unsubscribe"]) throw new Error(JSON.stringify(r));
  if (!t.html.includes("Box &lt;b&gt;")) throw new Error("not escaped");
});
Deno.test("allowlist skips", async () => {
  Deno.env.set("EMAIL_MODE","allowlist"); Deno.env.set("EMAIL_ALLOWLIST","@nordiciq.no, roy@x.com");
  const r1 = await sendEmail({to:"stranger@gmail.com",tag:"t",subject:"s",html:"h",text:"t"}); if (r1.status!=="skipped") throw 1;
  globalThis.fetch = (async () => new Response(JSON.stringify({messageId:"m"}),{status:201})) as any;
  const r2 = await sendEmail({to:"ola@nordiciq.no",tag:"t",subject:"s",html:"h",text:"t"}); if (r2.status!=="sent") throw 2;
});
Deno.test("provider error surfaces as failed", async () => {
  Deno.env.set("EMAIL_MODE","live");
  globalThis.fetch = (async () => new Response(JSON.stringify({code:"unauthorized",message:"Key not found"}),{status:401})) as any;
  const r = await sendEmail({to:"a@b.com",tag:"t",subject:"s",html:"h",text:"t"}); if (r.status!=="failed"||!r.error?.includes("401")) throw new Error(JSON.stringify(r));
});
