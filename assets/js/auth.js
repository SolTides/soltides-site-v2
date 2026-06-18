import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { CONFIG } from "./config.js";

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabasePublishableKey);

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token || null;
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data || { user_id: user.id, email: user.email };
}

export async function saveProfile(profile) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please log in first.");
  const row = {
    user_id: user.id,
    email: user.email,
    full_name: profile.full_name || "",
    phone: profile.phone || "",
    default_shipping_name: profile.default_shipping_name || profile.full_name || "",
    default_shipping_address: profile.default_shipping_address || "",
    default_shipping_city: profile.default_shipping_city || "",
    default_shipping_state: String(profile.default_shipping_state || "").toUpperCase(),
    default_shipping_zip: profile.default_shipping_zip || ""
  };
  const { data, error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveProfileFromCustomer(customer) {
  return saveProfile({
    full_name: customer.name,
    phone: customer.phone,
    default_shipping_name: customer.name,
    default_shipping_address: customer.street,
    default_shipping_city: customer.city,
    default_shipping_state: customer.state,
    default_shipping_zip: customer.zip
  });
}

export async function fetchMyOrders() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export function fillCheckoutFields(profile, user = null) {
  if (!profile && !user) return;
  const setIfEmpty = (id, value) => {
    const el = document.getElementById(id);
    if (el && !el.value && value) el.value = value;
  };
  setIfEmpty("customerName", profile?.default_shipping_name || profile?.full_name);
  setIfEmpty("customerEmail", user?.email || profile?.email);
  setIfEmpty("customerPhone", profile?.phone);
  setIfEmpty("customerAddress", profile?.default_shipping_address);
  setIfEmpty("customerCity", profile?.default_shipping_city);
  setIfEmpty("customerState", profile?.default_shipping_state);
  setIfEmpty("customerZip", profile?.default_shipping_zip);
}
