// Public configuration. Everything here is safe to expose in the browser.
// Secret keys live ONLY in Supabase secrets.
window.MMB_CONFIG = {
  supabaseUrl: "https://[PROJECT-REF].supabase.co",
  supabaseAnonKey: "[SUPABASE ANON / PUBLISHABLE KEY]",
  // Telegram group link. Replace the placeholder with your actual Telegram group URL when it's live.
  // Format: https://t.me/yourgroupname
  telegramUrl: "https://t.me/[TELEGRAM_GROUP]",
  // Hide the "Already on the list" counter until it is big enough to impress.
  minCountToShow: 250,
  countries: ["AT","AU","BE","BG","CA","CH","CY","CZ","DE","DK","EE","ES","FI","FR","GB","GR","HR","HU","IE","IS","IT","LI","LT","LU","LV","MT","NL","NO","NZ","PL","PT","RO","SE","SI","SK","US"]
};
