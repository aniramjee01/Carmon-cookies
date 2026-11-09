/**
 * Carmen Cookie Jar — public storefront configuration.
 * Public settings only. NEVER put your Square access token, webhook key,
 * admin password, or private credentials in this file or anywhere in /site.
 */
window.CARMEN_CONFIG = {
  // Replace this with your deployed Cloudflare Worker URL (no slash at end).
  // Example: "https://carmen-cookie-api.your-subdomain.workers.dev"
  apiBase: "",
  phone: "+14638672562",
  businessName: "Carmen Cookie Jar",
  timezone: "America/Indiana/Indianapolis",
  deliveryFeeCents: 400,
  // These display windows match the backend validation windows.
  slots: {
    Thursday: ["4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM"],
    Friday: ["4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM"],
    Saturday: ["10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"]
  }
};
