import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import twilio from "twilio";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

// ===================== CONFIG =====================
const {
  SUPABASE_URL,
  SUPABASE_KEY,
  JWT_SECRET,
  FRONTEND_URL,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_WHATSAPP_NUMBER,
  PORT
} = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY || !JWT_SECRET) {
  console.error("❌ Missing required env vars: SUPABASE_URL, SUPABASE_KEY, JWT_SECRET");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const twilioClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN)
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

// ===================== MIDDLEWARE =====================
app.use(cors({
  origin: FRONTEND_URL || "https://sos-ui.vercel.app", // set FRONTEND_URL in Render to override
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Consistent error responses
function fail(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

// JWT auth middleware — attaches req.user = { id, name, email }
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return fail(res, 401, "Missing or invalid authorization header.");
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return fail(res, 401, "Session expired or invalid — please log in again.");
  }
}

// ===================== HEALTH =====================
app.get("/api/test", (req, res) => {
  res.json({ message: "✅ Backend is running with Supabase!" });
});
app.get("/", (req, res) => res.send("SafeGuard API is live."));

// ===================== AUTH =====================
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return fail(res, 400, "Name, email and password are required.");
  }
  if (password.length < 6) {
    return fail(res, 400, "Password must be at least 6 characters.");
  }

  const { data: existing, error: lookupErr } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (lookupErr) return fail(res, 500, "Could not check existing accounts.");
  if (existing) return fail(res, 409, "An account with this email already exists.");

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from("users")
    .insert([{ name, email, password_hash }])
    .select("id, name, email")
    .single();

  if (error) return fail(res, 400, error.message);
  res.json({ success: true, user: data });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return fail(res, 400, "Email and password are required.");
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (error) return fail(res, 500, "Login lookup failed.");
  if (!user) return fail(res, 401, "Invalid email or password.");

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return fail(res, 401, "Invalid email or password.");

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    success: true,
    token,
    user: { id: user.id, name: user.name, email: user.email }
  });
});

// ===================== CONTACTS (protected, user-scoped) =====================
app.get("/api/contacts", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("user_id", req.user.id);

  if (error) return fail(res, 500, "Could not load contacts.");
  res.json(data);
});

app.post("/api/contacts", requireAuth, async (req, res) => {
  const { contact_name, contact_number, contact_email, relation } = req.body;

  if (!contact_name || !contact_number) {
    return fail(res, 400, "Contact name and phone number are required.");
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert([{
      user_id: req.user.id,
      contact_name,
      contact_number,
      contact_email: contact_email || null,
      relation: relation || null
    }])
    .select();

  if (error) return fail(res, 500, "Could not save contact.");
  res.json({ success: true, contact: data });
});

// ===================== SOS =====================
app.post("/api/sos", requireAuth, async (req, res) => {
  const { message, location } = req.body;

  if (!location) return fail(res, 400, "Location is required to send an SOS.");

  const finalMessage = message || "Emergency SOS! I need help.";

  const { data: alert, error } = await supabase
    .from("alerts")
    .insert([{
      user_id: req.user.id,
      message: finalMessage,
      location,
      timestamp: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) return fail(res, 500, "Could not record SOS alert.");

  // Respond immediately — don't make the person wait on notification delivery
  res.json({ success: true, alert });

  // Fire-and-forget notifications to trusted contacts
  const { data: contacts } = await supabase
    .from("contacts")
    .select("contact_name, contact_number, contact_email")
    .eq("user_id", req.user.id);

  if (contacts && contacts.length) {
    notifyContacts(contacts, req.user, finalMessage, location).catch(err =>
      console.error("Notification dispatch error:", err.message)
    );
  }
});

// ===================== ALERT HISTORY (protected) =====================
app.get("/api/alerts", requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", req.user.id)
    .order("timestamp", { ascending: false })
    .limit(50);

  if (error) return fail(res, 500, "Could not load alert history.");
  res.json(data);
});

// ===================== NOTIFICATIONS =====================
async function notifyContacts(contacts, user, message, location) {
  const mapsLink = `https://maps.google.com/?q=${location}`;
  const results = [];

  for (const c of contacts) {
    if (c.contact_email) results.push(sendEmail(c, user, message, mapsLink));
    if (c.contact_number) {
      results.push(sendSMS(c, user, message, mapsLink));
      results.push(sendWhatsApp(c, user, message, mapsLink));
    }
  }

  await Promise.allSettled(results);
}

async function sendEmail(contact, user, message, mapsLink) {
  if (!RESEND_API_KEY) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL || "SafeGuard <onboarding@resend.dev>",
        to: [contact.contact_email],
        subject: `🚨 SOS Alert from ${user.name}`,
        html: `<p><strong>${user.name}</strong> has triggered an emergency SOS alert.</p>
               <p>${message}</p>
               <p><a href="${mapsLink}">View live location on Google Maps</a></p>`
      })
    });
    if (!res.ok) console.error("Resend email failed:", await res.text());
  } catch (err) {
    console.error("Email send error:", err.message);
  }
}

async function sendSMS(contact, user, message, mapsLink) {
  if (!twilioClient || !TWILIO_PHONE_NUMBER) return;
  try {
    await twilioClient.messages.create({
      from: TWILIO_PHONE_NUMBER,
      to: contact.contact_number,
      body: `🚨 SOS from ${user.name}: ${message} Location: ${mapsLink}`
    });
  } catch (err) {
    console.error("SMS send error:", err.message);
  }
}

async function sendWhatsApp(contact, user, message, mapsLink) {
  if (!twilioClient || !TWILIO_WHATSAPP_NUMBER) return;
  try {
    await twilioClient.messages.create({
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${contact.contact_number}`,
      body: `🚨 SOS from ${user.name}: ${message} Location: ${mapsLink}`
    });
  } catch (err) {
    console.error("WhatsApp send error:", err.message);
  }
}

// ===================== START =====================
const port = PORT || 5000;
app.listen(port, () => {
  console.log(`🚀 SafeGuard backend running on port ${port}`);
});