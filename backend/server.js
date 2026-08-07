import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Supabase connection
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ✅ Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "✅ Backend is running with Supabase!" });
});

// 👤 Register a user
// Expects: { name, email, password }
// users table: id, name, email (unique), password_hash, created_at
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from("users")
    .insert([{ name, email, password_hash }])
    .select("id, name, email")
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, user: data });
});

// 🔑 Login a user
// Expects: { email, password }
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  if (!user) return res.status(401).json({ error: "Invalid email or password." });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password." });

  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
});

// 🚨 Add SOS alert
app.post("/api/sos", async (req, res) => {
  const { user_id, message, location } = req.body;

  const { data, error } = await supabase
    .from("alerts")
    .insert([{ user_id, message, location, timestamp: new Date().toISOString() }])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, alert: data });
});

// 📜 Get alerts for a user
app.get("/api/alerts/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", user_id)
    .order("timestamp", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 👥 Add a contact
// contacts table: id, user_id, contact_name, contact_number, contact_email, relation
app.post("/api/contacts", async (req, res) => {
  const { user_id, contact_name, contact_number, contact_email, relation } = req.body;

  if (!user_id || !contact_name || !contact_number) {
    return res.status(400).json({ error: "user_id, contact_name and contact_number are required." });
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert([{ user_id, contact_name, contact_number, contact_email, relation }])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true, contact: data });
});

// 📜 Get contacts for a user
app.get("/api/contacts/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("user_id", user_id);

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});