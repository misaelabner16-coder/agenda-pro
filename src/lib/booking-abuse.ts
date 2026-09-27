import { createHmac } from "node:crypto";
import { isIP } from "node:net";

// Only trust the deployment platform, not arbitrary X-Forwarded-For on other hosts.
export function bookingClientDigest(headers: Headers, secret: string, onVercel: boolean, localTest = false) {
  if (secret.length < 32) throw new Error("Booking server credential missing");
  let ip: string;
  if (onVercel) {
    ip = headers.get("x-vercel-forwarded-for")?.trim() || "";
    if (!isIP(ip)) throw new Error("Trusted client address unavailable");
  } else if (localTest) ip = "local-security-test";
  else throw new Error("Trusted booking proxy not configured");
  // Group IPv6 by /64 to avoid bypass via per-request interface-address rotation.
  if (isIP(ip) === 6) {
    const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const [left, right = ""] = canonical.split("::");
    const head = left ? left.split(":") : [];
    const tail = right ? right.split(":") : [];
    const groups = canonical.includes("::") ? [...head, ...Array(8-head.length-tail.length).fill("0"), ...tail] : head;
    ip = groups.slice(0,4).map(g => g.padStart(4,"0")).join(":") + "::/64";
  }
  return createHmac("sha256", secret).update(`booking-ip:${ip}`).digest("hex");
}

export function bookingPhoneDigest(slug: string, normalizedPhone: string, secret: string) {
  return createHmac("sha256", secret).update(`booking-phone:${slug}:${normalizedPhone}`).digest("hex");
}
