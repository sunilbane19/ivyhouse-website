# Ivy House Website Version

## V3 — Stable, tested baseline

Date: 2 September 2026

This version records the current production state after testing the public Ivy House website and the private Admin function.

### Tested
- Public website
- Admin Google sign-in
- Admin access control / multiple-admin setup
- Availability
- Gallery
- Sign out
- Desktop flow
- Mobile flow

### Security baseline
- Admin email is not hard-coded in the client
- Admin OAuth uses PKCE

### Previous milestones
- V1 — stable Ivy House baseline
- V2 — support for multiple Ivy House admins

Future changes should start from this V3 baseline.

### Google Reviews integration — September 2026
- Google Business Profile API access configured using the existing Supabase Google OAuth client
- Added secure Google Business Profile connection and cached review tables
- Added Vault-backed Google provider refresh-token storage
- Added authenticated `google-business-reviews` Edge Function
- Added Admin Google Reviews connection, refresh and publish controls
- Added public selected-review display
- Removed the hardcoded admin email from the gallery migration Edge Function
- OAuth connection remains a separate flow from normal Ivy House Admin sign-in
