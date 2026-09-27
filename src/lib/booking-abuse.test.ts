import assert from "node:assert/strict";
import test from "node:test";
import { bookingClientDigest, bookingPhoneDigest } from "./booking-abuse.ts";
const secret = "test-only-credential-not-a-real-key";
test("booking limiter trusts only the platform client IP and fails closed elsewhere", () => {
  const h = new Headers({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "203.0.113.99" });
  const digest = bookingClientDigest(h, secret, true);
  h.set("x-forwarded-for", "10.0.0.1");
  assert.equal(bookingClientDigest(h, secret, true), digest);
  assert.throws(() => bookingClientDigest(h, secret, false));
  assert.throws(() => bookingClientDigest(new Headers(), secret, true));
  h.set("x-vercel-forwarded-for", "192.0.2.1, 10.0.0.1");
  assert.throws(() => bookingClientDigest(h, secret, true));
  assert.match(digest, /^[a-f0-9]{64}$/);
});
test("IPv6 spellings and interface rotation cannot reset a /64 quota", () => {
  const digest = (ip: string) => bookingClientDigest(new Headers({ "x-vercel-forwarded-for": ip }), secret, true);
  assert.equal(digest("2001:db8:1:2::1"), digest("2001:0db8:0001:0002:ffff:abcd:1234:9999"));
  assert.notEqual(digest("2001:db8:1:2::1"), digest("2001:db8:1:3::1"));
});
test("phone buckets are keyed, opaque and isolated by establishment", () => {
  assert.notEqual(bookingPhoneDigest("a", "11900000000", secret), bookingPhoneDigest("b", "11900000000", secret));
  assert.notEqual(bookingPhoneDigest("a", "11900000000", secret), bookingPhoneDigest("a", "11900000000", secret+"rotated"));
});
