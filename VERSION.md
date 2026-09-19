# Ivy House Website Version

## V4 — Frozen production release

**Date:** 19 September 2026  
**Status:** Frozen / production release

This version is the completed and tested production state of the Ivy House website following the Google Business Profile Reviews integration.

### V4 scope

- Public Ivy House website
- Admin Google sign-in and access control
- Multiple Ivy House admins
- Availability
- Gallery
- Sign out
- Desktop and mobile flows
- Google Business Profile Reviews integration
- Secure Google Business Profile connection through the existing Google OAuth client
- Cached Google reviews in Supabase
- Admin review refresh and editorial Publish controls
- Public Reviews navigation
- Public display of up to 15 selected Google reviews
- Direct link to the Ivy House Google Business Profile listing
- Google Reviews responsive layout and spacing refinements
- Removed hardcoded admin email from the gallery migration Edge Function

### Security baseline

- Admin email is not hard-coded in the client
- Admin OAuth uses PKCE
- Google Business Profile access is a separate OAuth flow from normal Admin sign-in
- Google provider refresh token is stored through Supabase Vault-backed functions
- Public users can read only active reviews explicitly published to the website

### V4 freeze point

Final Google Reviews display commit before this version record:

`a89ba645a8633fcc6c7af40515097286d80e25f4`

The V4 version record itself is the final commit for this frozen release.

### Previous milestones

- V1 — stable Ivy House baseline
- V2 — support for multiple Ivy House admins
- V3 — stable, tested baseline
- V4 — Google Reviews integration and final production release

**V4 is now closed for development. Future changes should start as a new version from this frozen baseline.**
