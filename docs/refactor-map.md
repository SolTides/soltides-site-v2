# SolTides Refactor Map

This version keeps the same customer-facing site but moves the code into a cleaner app structure.

## Frontend

- `assets/js/config.js` stores browser-safe configuration.
- `assets/js/products.js` loads products from the Google Sheet with local JSON fallback.
- `assets/js/cart.js` handles cart state and cart drawer rendering.
- `assets/js/checkout.js` submits checkout to the backend.
- `assets/js/ui.js` renders product cards, product detail pages, accordions, and menus.
- `assets/js/admin.js` handles admin login/order dashboard.

## Backend

- `netlify/functions/create-order.js` validates cart pricing server-side, saves orders, saves order items, and sends the EmailJS order confirmation.
- `netlify/functions/get-admin-orders.js` loads orders for logged-in admins.
- `netlify/functions/update-order.js` updates payment status, shipping status, and tracking.

## Database

Supabase remains the source of truth for orders and customer data.
