SmartDoor

SmartDoor is a QR-powered smart nameplate and visitor communication platform.

Visitors scan a QR code mounted outside a home, apartment, office, or society gate and can securely communicate with the owner without exposing personal contact information.

Core Features

Visitor Features

- Secure masked calling
- Voice notes
- Text messaging
- SOS emergency alerts
- Digital doorbell
- Owner status visibility
- QR-based visitor access

Owner Features

- Dashboard
- Communication history
- Notifications
- Visitor management
- Family member management
- Subscription management

Admin Features

- Customer provisioning
- Plate generation
- QR generation
- PIN reset
- Ownership transfer
- Suspension and reactivation
- Manufacturing tracking
- Audit logs

---

Current Architecture

Frontend:

- HTML
- CSS
- JavaScript

Backend:

- Supabase
- Edge Functions
- PostgreSQL
- Storage

Authentication:

- Supabase Auth
- PIN-based owner login
- Admin login
- Role-based access control

Payments:

- Razorpay

Communication:

- Exotel
- Twilio
- WhatsApp integration

---

Database Core Tables

- users
- plates
- subscriptions
- notifications
- message_logs
- call_logs
- audit_logs
- admin_users
- ownership_transfers
- activation_events

---

Critical Rules

Never rebuild existing systems.

Always extend existing systems.

Reuse:

- Existing tables
- Existing services
- Existing Edge Functions
- Existing auth flow
- Existing dashboard architecture

Never duplicate functionality already present in the repository.

---

Existing Production Flows

Purchase Flow

Customer
→ Razorpay
→ Plate Creation
→ QR Generation
→ Subscription
→ Activation

Visitor Flow

QR Scan
→ Visitor Page
→ Communication Options
→ Owner Notification

Owner Flow

Login
→ Dashboard
→ Communication Center
→ Notifications

Admin Flow

Admin Login
→ Dashboard
→ Customer Management
→ Plate Management
→ Support Operations

---

Long-Term Vision

SmartDoor should become a complete smart access and visitor communication platform capable of handling:

- Individual homes
- Apartments
- Housing societies
- Offices
- Commercial buildings

Target architecture must support tens of thousands of active plates without major redesign.
