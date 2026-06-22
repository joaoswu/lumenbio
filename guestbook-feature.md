# Guestbook Feature Plan

This file outlines the steps to implement a custom, modular guestbook feature for Lumenbio pages.

## Proposed Changes

### Backend Components
1. **defaultConfig.js**: Add `guestbook: { enabled: false, allowAnonymous: true }`.
2. **store.js**: Implement `getGuestbookMessages`, `addGuestbookMessage`, and `deleteGuestbookMessage`.
3. **bio.js**:
   - `GET /api/bio/:username/guestbook`
   - `POST /api/bio/:username/guestbook`
   - `DELETE /api/bio/:username/guestbook/:id`

### Frontend Components
1. **index.html**: Add a guestbook layout to the card stack.
2. **guestbook.js**: Manage fetching, submitting, and animating comments.
3. **styles.css**: Style the comments scroll box and input form with glassmorphism.

### Dashboard Settings
1. **dashboard/index.html**: Add a guestbook tab and tab-panel to configure parameters and delete messages.
2. **dashboard/dashboard.js**: Wire up save behaviors and delete/load routes.
