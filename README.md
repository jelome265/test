Below is the **enterprise-grade project definition** for your courier platform.

---

# 1) Problems This Project Addresses

This platform solves a **set of operational, trust, and financial problems** that exist in manual or semi-digital courier workflows.

## 1.1 Fragmented delivery requests



Today, courier requests in many small-to-mid operations are handled through calls, WhatsApp, paper notes, or informal staff memory. That creates:

* lost requests
* duplicated requests
* unclear pickup details
* no audit trail
* weak accountability

Your platform centralizes the request lifecycle so every shipment has a record from creation to confirmation.

## 1.2 Poor package validation

In manual systems, users often send items outside policy: overweight parcels, unsupported locations, or incomplete addresses.
Your app addresses this by enforcing:

* **10kg max package weight**
* **delivery region restrictions**
* structured sender/receiver data
* mandatory location capture

This reduces operational waste and failed deliveries.

## 1.3 Lack of real-time visibility

Without tracking, users do not know whether a package is approved, collected, in transit, delivered, or stuck. That creates support pressure and disputes.
Your app addresses this by providing:

* shipment status tracking
* confirmation of receipt
* notifications at every state transition

## 1.4 Weak payment coordination

Courier services fail when payment and fulfillment are disconnected. If payment is manual, delayed, or hard to reconcile, finance becomes a mess.
Your app addresses this by embedding:

* distance-based pricing
* mobile money payments
* bank payment support
* payment gateway abstraction through Paychangu

## 1.5 Poor operational control

If admin/owner approval is not built into the workflow, the business loses control of what gets accepted, routed, and delivered.
Your app addresses this by making the admin part of the operational loop:

* request approval
* notification of new requests
* manual control where needed
* service restriction enforcement

## 1.6 Lack of proof and dispute handling

Courier disputes are normal. The system needs evidence:

* who sent it
* who received it
* when it was delivered
* where it was delivered
* what the package was

Your app addresses this through:

* delivery confirmation
* shipment history
* tracking records
* structured request metadata

## 1.7 Geographic service constraint

You are not building a universal logistics network. You are building a **restricted regional delivery service** for:

* Lilongwe
* Blantyre
* Mzuzu

That is a real operational constraint, and the app is meant to enforce it instead of pretending it can do everything.

---

# 2) Aims and SMART Objectives

## 2.1 Overall Aim

To build a secure, reliable, mobile courier platform for iOS and Android that supports controlled package pickup, region-limited delivery, payment integration, and delivery confirmation, with administrative oversight and auditability.

## 2.2 SMART Objectives

### Objective 1: Digital request creation

**Specific:** Allow users to create courier requests with sender, receiver, location, package weight, and destination details.
**Measurable:** 100% of requests must be stored with complete structured data.
**Achievable:** Through form validation and server-side business rules.
**Relevant:** This is the core business workflow.
**Time-bound:** Available in the first production release.

### Objective 2: Enforce delivery rules

**Specific:** Reject packages above 10kg and reject routes outside supported regions.
**Measurable:** 100% enforcement on backend, not just the mobile UI.
**Achievable:** Validation rules and server-side checks.
**Relevant:** Prevents invalid orders and operational overload.
**Time-bound:** Before public launch.

### Objective 3: Add payment support

**Specific:** Support Airtel, TNM, and bank payments through a payment gateway layer.
**Measurable:** Successful payment initiation and reconciliation for each request.
**Achievable:** Payment provider integration and callback handling.
**Relevant:** Required for revenue collection.
**Time-bound:** In the production payment release.

### Objective 4: Track delivery status

**Specific:** Provide status visibility from request to confirmation.
**Measurable:** Every shipment must have a visible lifecycle state.
**Achievable:** Stateful shipment records and notifications.
**Relevant:** Reduces support requests and user uncertainty.
**Time-bound:** Included in launch scope.

### Objective 5: Improve operational response

**Specific:** Notify the owner/admin immediately when a request is created.
**Measurable:** Notification dispatch success rate above agreed threshold.
**Achievable:** Event-driven notification triggers.
**Relevant:** Admin oversight is mandatory for your workflow.
**Time-bound:** Before production rollout.

---

# 3) Scope

## 3.1 In Scope

The system includes:

* mobile app for **iOS and Android**
* user authentication and session management
* sender and receiver registration
* package pickup request creation
* weight validation with **10kg maximum**
* service region restriction to **Lilongwe, Blantyre, Mzuzu**
* admin notification for new requests
* price calculation based on distance
* payment initiation and reconciliation
* package tracking
* delivery confirmation
* shipment history
* admin oversight functions
* audit trail for key actions
* push/in-app notifications
* error handling and status messaging
* secure storage and backend synchronization

## 3.2 Out of Scope

Unless you explicitly expand it later, do not pretend these are included:

* international shipping
* warehouse management
* customs clearance
* fleet optimization with advanced route AI
* driver marketplace / gig dispatch model
* inventory management for merchants
* refrigerated chain logistics
* COD cash handling beyond your defined payment rails
* multi-country tax logic
* return logistics automation
* desktop-first admin web replacement if you are building mobile-first only

## 3.3 Scope Boundaries

This is a **region-constrained courier orchestration platform**.
It is **not** a generalized logistics ERP.
If you try to ship ERP complexity on day one, you will slow delivery and increase failure risk.

---

# 4) Risks, Mitigations, and Failure Modes

This is the section people skip and then regret in production.

## 4.1 Authentication compromise

### Risk

Weak auth lets unauthorized users access requests, personal data, or admin functions.

### Failure mode

* session hijacking
* account takeover
* unauthorized shipment manipulation
* payment abuse

### Mitigation

* secure auth provider
* short-lived sessions
* refresh token rotation
* role-based access control
* rate limiting
* device/session logout
* optional step-up auth for sensitive actions

### What to analyze

* login abuse patterns
* brute-force resistance
* password reset flow security
* token expiry behavior
* privilege escalation paths

---

## 4.2 Invalid shipment intake

### Risk

Users enter fake locations, bad receiver data, or overweight packages.

### Failure mode

* failed deliveries
* wasted trips
* bad pricing
* manual correction overhead

### Mitigation

* server-side validation
* hard business rule enforcement
* location normalization
* required field checks
* restricted region logic
* weight cutoff at backend

### What to analyze

* form validation coverage
* backend validation parity
* edge cases like decimals, nulls, malformed values
* duplicate request submissions

---

## 4.3 Payment mismatch

### Risk

Payment succeeds but request remains unpaid, or payment fails but order moves forward.

### Failure mode

* revenue loss
* fake delivery states
* customer disputes
* reconciliation hell

### Mitigation

* payment state machine
* webhook verification
* idempotency keys
* provider callback verification
* pending/paid/failed states
* reconciliation logs

### What to analyze

* callback timing
* retry behavior
* duplicate payment notifications
* payment timeout handling
* transaction status drift

---

## 4.4 Notification failure

### Risk

Admin or customer does not receive important updates.

### Failure mode

* delayed response
* manual follow-up
* support burden
* missed approvals

### Mitigation

* multi-channel notification strategy
* retry queue
* notification logging
* fallback in-app inbox
* dead-letter handling for failed jobs

### What to analyze

* push delivery success rate
* notification latency
* offline device scenarios
* alert duplication
* silent failure conditions

---

## 4.5 Data inconsistency

### Risk

Shipment, payment, and tracking records diverge.

### Failure mode

* one screen says delivered, another says pending
* support cannot trust records
* admin makes wrong operational decisions

### Mitigation

* single source of truth
* transactional writes where possible
* state transition validation
* event logging
* audit trail
* strict schema design

### What to analyze

* concurrency conflicts
* stale cache behavior
* retry-induced duplicates
* race conditions between payment and status updates

---

## 4.6 Location logic failure

### Risk

Distance calculations or region detection are wrong.

### Failure mode

* incorrect pricing
* invalid route acceptance
* operational mismatch

### Mitigation

* canonical location data
* explicit region mapping
* fallback manual review for ambiguous locations
* validation against supported cities

### What to analyze

* geocoding accuracy
* boundary cases near city edges
* user-entered landmark ambiguity
* distance algorithm consistency

---

## 4.7 Poor user experience

### Risk

Users cannot complete requests without confusion.

### Failure mode

* form abandonment
* support tickets
* low adoption
* app-store complaints

### Mitigation

* clean form flow
* progressive disclosure
* clear error states
* saved addresses
* concise status screens
* fast loading
* accessible UI components

### What to analyze

* task completion time
* drop-off points
* field-level error frequency
* readability on low-end phones
* tap target size and navigation clarity

---

## 4.8 Performance degradation

### Risk

The app becomes slow under load or on weak networks.

### Failure mode

* delayed screen loads
* failed submissions
* user distrust
* payment retry storms

### Mitigation

* efficient API design
* pagination
* background sync
* caching where appropriate
* small payloads
* optimized database queries
* upload compression

### What to analyze

* API response times
* cold start behavior
* mobile network loss scenarios
* peak transaction load
* database query cost

---

## 4.9 Operational abuse and fraud

### Risk

Users create fake orders, repeatedly abuse payment or delivery flows, or submit false delivery claims.

### Failure mode

* revenue loss
* fake demand
* staff waste
* legal disputes

### Mitigation

* fraud rules
* request throttling
* account risk scoring
* proof of delivery
* audit logs
* rejection reasons

### What to analyze

* duplicate requests
* suspicious activity patterns
* account reuse
* repeated failed payment attempts
* inconsistent delivery confirmations

---

## 4.10 Backend outage / vendor outage

### Risk

Supabase, payment provider, or notification provider has downtime.

### Failure mode

* inability to create or track requests
* payment failures
* delayed notifications

### Mitigation

* graceful degradation
* retry queues
* offline-tolerant UX
* provider abstraction layer
* fallback error states
* health checks and alerting

### What to analyze

* dependency failure behavior
* recovery time
* partial outage handling
* queue backlog behavior
* manual operational fallback

---

# 5) Deliverables Summary

## Core deliverables

1. **Mobile app** for iOS and Android
2. **Authentication system**
3. **Courier request workflow**
4. **Admin oversight capability**
5. **Payment integration**
6. **Shipment tracking**
7. **Delivery confirmation flow**
8. **Notification system**
9. **Database schema and migrations**
10. **Operational audit logs**
11. **Test suite**
12. **Deployment pipeline**
13. **App store release package**
14. **Documentation**
15. **Monitoring and alerting setup**

## Supporting deliverables

* API specification
* data model specification
* security review checklist
* release checklist
* rollback plan
* support/admin procedures
* incident handling process

---

# 6) Requirements Specification

This should be treated as the system’s contract.

## 6.1 Business requirement

The platform shall enable users to request courier pickup and delivery for supported regions only, with package validation, payment, admin oversight, and delivery confirmation.

## 6.2 User requirement

* Users shall be able to sign in and manage their account.
* Users shall be able to create a package pickup request.
* Users shall be able to see request status.
* Users shall be able to pay for delivery.
* Users shall be able to confirm receipt.

## 6.3 System requirement

* The system shall enforce maximum package weight.
* The system shall reject unsupported regions.
* The system shall calculate delivery cost from distance.
* The system shall notify admin on every new request.
* The system shall record all status changes.
* The system shall support secure payment callbacks.
* The system shall store auditable shipment records.

## 6.4 Data requirement

The system shall store:

* user identity data
* sender data
* receiver data
* pickup location
* drop-off location
* package weight
* shipment state
* payment state
* notification state
* timestamps
* audit metadata

## 6.5 Security requirement

The system shall:

* authenticate all protected access
* authorize actions by role
* protect payment flows
* log sensitive operations
* avoid exposing private user data to unauthorized actors

---

# 7) Functional Requirements (FR)

I am writing these in a serious requirements style.

## Authentication and user management

**FR-01:** The system shall allow users to register an account using supported identity fields.
**FR-02:** The system shall allow users to log in securely.
**FR-03:** The system shall maintain authenticated sessions across app usage.
**FR-04:** The system shall allow password reset or account recovery.
**FR-05:** The system shall support role-based access for customer, admin, and other authorized roles.

## Shipment creation

**FR-06:** The system shall allow authenticated users to create a delivery request.
**FR-07:** The system shall collect sender details during request creation.
**FR-08:** The system shall collect receiver details during request creation.
**FR-09:** The system shall collect pickup location details during request creation.
**FR-10:** The system shall collect destination location details during request creation.
**FR-11:** The system shall collect package weight during request creation.
**FR-12:** The system shall reject shipments above 10kg.
**FR-13:** The system shall reject requests outside supported service regions.
**FR-14:** The system shall prevent submission when required fields are incomplete.

## Pricing and payment

**FR-15:** The system shall calculate delivery cost based on distance.
**FR-16:** The system shall show price before payment confirmation.
**FR-17:** The system shall support payment via Airtel, TNM, and bank rails through the gateway integration.
**FR-18:** The system shall store payment initiation status.
**FR-19:** The system shall store payment completion status.
**FR-20:** The system shall reconcile payment callbacks with shipment records.
**FR-21:** The system shall not mark a shipment as payable/paid without verified payment state.

## Notifications

**FR-22:** The system shall notify the owner/admin when a new request is created.
**FR-23:** The system shall notify users when a request status changes.
**FR-24:** The system shall notify users when payment succeeds or fails.
**FR-25:** The system shall notify users when a shipment is delivered or confirmed.

## Tracking and confirmation

**FR-26:** The system shall display shipment status history to the user.
**FR-27:** The system shall allow the receiver or authorized party to confirm receipt.
**FR-28:** The system shall store proof of confirmation.
**FR-29:** The system shall keep a searchable shipment history.

## Admin operations

**FR-30:** The system shall provide an admin view of all requests.
**FR-31:** The system shall allow admin review and approval of shipment requests.
**FR-32:** The system shall allow admin rejection with reason.
**FR-33:** The system shall allow admin to monitor active and completed shipments.
**FR-34:** The system shall provide audit trails for administrative actions.

## Reporting and support

**FR-35:** The system shall allow users to raise delivery issues or disputes.
**FR-36:** The system shall expose shipment history for support review.
**FR-37:** The system shall provide operational reports to admin.
**FR-38:** The system shall preserve evidence of key lifecycle events.

---

# 8) Non-Functional Requirements (NFR)

These are not optional. They determine whether the app survives production.

## 8.1 Security

**NFR-01:** All sensitive traffic shall use TLS.
**NFR-02:** Authentication tokens shall be securely stored and rotated as needed.
**NFR-03:** Role-based authorization shall protect admin functions.
**NFR-04:** Payment callbacks shall be verified before state changes.
**NFR-05:** The system shall log sensitive operations for audit.
**NFR-06:** The system shall minimize exposure of personal data.
**NFR-07:** Input validation shall occur on both client and server.

## 8.2 Performance

**NFR-08:** Core screens shall load within acceptable mobile latency targets on typical networks.
**NFR-09:** Request creation shall complete without unnecessary blocking.
**NFR-10:** The system shall remain responsive under peak load.
**NFR-11:** Database queries shall be optimized for indexed access patterns.
**NFR-12:** Background notifications shall not block user actions.

## 8.3 Availability and reliability

**NFR-13:** The system shall tolerate temporary payment or notification provider failures.
**NFR-14:** The system shall support retries for transient failures.
**NFR-15:** The system shall avoid duplicate side effects on retried requests.
**NFR-16:** The system shall have defined backup and recovery procedures.

## 8.4 Usability

**NFR-17:** The UI shall be understandable without support intervention.
**NFR-18:** Forms shall provide clear validation feedback.
**NFR-19:** The app shall be usable on low-end devices.
**NFR-20:** The app shall be accessible enough for practical real-world use.

## 8.5 Maintainability

**NFR-21:** The codebase shall be modular and testable.
**NFR-22:** Business rules shall not be scattered across screens.
**NFR-23:** Integration logic shall be isolated behind service boundaries.
**NFR-24:** Configuration shall be externalized where appropriate.

## 8.6 Scalability

**NFR-25:** The backend shall support growth in users, requests, and notifications without redesign.
**NFR-26:** The architecture shall support more regions in the future without breaking current rules.
**NFR-27:** The payment layer shall be extensible to new providers.

## 8.7 Observability

**NFR-28:** The system shall provide logs, metrics, and error tracking.
**NFR-29:** Critical failures shall be detectable quickly.
**NFR-30:** Operational anomalies shall be traceable to user actions and requests.

---

# 9) Requirements Traceability

Traceability means every requirement must map to a reason, a design decision, and a test.

## Example traceability structure

| Business Need             | Requirement                    | Design Element                                | Test Evidence                    |
| ------------------------- | ------------------------------ | --------------------------------------------- | -------------------------------- |
| Prevent invalid packages  | FR-12 weight rejection         | Backend validation rule                       | Weight > 10kg request rejected   |
| Operate only in 3 regions | FR-13 service area enforcement | Region lookup + city restriction              | Request outside region rejected  |
| Get paid before delivery  | FR-17 to FR-21 payment flow    | Payment provider integration + status machine | Payment success updates shipment |
| Keep admin informed       | FR-22 admin notification       | Event trigger + notification service          | Admin receives new request alert |
| Show shipment state       | FR-26 tracking history         | Shipment lifecycle store                      | Status timeline visible          |
| Prevent fraud             | NFR-01 to NFR-07 security      | Auth + RBAC + audit logs                      | Unauthorized access denied       |

## What traceability must cover

Each requirement should trace to:

* a business problem
* a UI surface or API
* a database entity
* a test case
* an operational monitoring signal

If it cannot be traced, it is not properly specified.

---

# 10) Tech Stack

You asked for tech stack, so here is the production-grade answer for this kind of mobile courier platform.

## Mobile app

Use **React Native with TypeScript**.

### Why

* one codebase for iOS and Android
* strong ecosystem
* fits a Node.js-centered team
* easier integration with payment, notifications, and backend APIs

### Why not plain native first

Native iOS + native Android gives performance, but doubles build cost, doubles maintenance, and slows iteration. That is wasteful unless you have a large mobile team.

## Backend

Use **Node.js with TypeScript**.

### Why

* good fit for async I/O heavy workflows
* ideal for API orchestration, payments, notifications, and auth flows
* easier integration with Supabase
* strong ecosystem for validation, queues, and webhook processing

### What to avoid

Do not dump business logic into random mobile screens.
Do not rely on client-side validation only.
Do not write payment logic directly in UI code.

## Database / backend platform

Use **Supabase**.

### Why

* managed auth
* managed Postgres
* serverless-friendly
* storage and database features
* good for rapid delivery without self-hosting a full backend stack

### Caveat

Supabase is not an excuse to write lazy architecture. You still need:

* strict schema design
* row-level security
* audit logging
* server-side validation
* transactional discipline

## Payment integration

Use **Paychangu** as the abstraction layer for Airtel, TNM, and bank payments.

### Why

* reduces integration surface
* centralizes payment flows
* simplifies reconciliation

## Notifications

* Push notifications: **Firebase Cloud Messaging**
* In-app notifications: database-backed notification feed
* Optional SMS fallback if business requires it

## Maps / geolocation

* location services: device geolocation APIs
* map rendering: Google Maps or Mapbox depending on commercial fit
* distance calculation: backend-controlled logic, not only client-side

## File / proof storage

Use Supabase Storage or equivalent controlled object storage for:

* proof of delivery
* receipts
* images of packages
* support evidence

## Validation and safety

* schema validation: Zod or equivalent
* server validation: required
* rate limiting: required
* RBAC: required
* audit logs: required

## Testing

* unit tests
* integration tests
* payment webhook tests
* end-to-end tests
* device testing on low-end Android and iPhone models
* regression tests for shipment state changes

## CI/CD

* GitHub Actions or equivalent
* environment separation: dev, staging, production
* automated builds
* automated security checks
* release tagging

---

# What Must Be Analyzed Before Going Live

This is the real production readiness list.

## 1. Security analysis

Check:

* auth hardening
* password reset safety
* session handling
* RBAC correctness
* payment callback verification
* data exposure through APIs
* storage permissions
* admin privilege boundaries
* rate limiting
* brute-force resistance
* audit logging

How to analyze:

* threat model the login, request creation, payment, and admin flows
* test unauthorized access paths
* run negative tests against APIs
* inspect database row-level security rules
* simulate token expiry and replay attempts

---

## 2. Performance analysis

Check:

* screen load times
* API latency
* payment initiation time
* notification dispatch delays
* database query cost
* cold-start behavior if using serverless functions
* payload size
* low-bandwidth behavior

How to analyze:

* benchmark the slowest user journeys
* load test critical endpoints
* inspect query plans
* test on weak Android devices and poor mobile data
* measure first meaningful screen render time

---

## 3. Reliability analysis

Check:

* retry behavior
* failed payment recovery
* notification failure recovery
* stale state correction
* duplicate submission handling
* outage handling for dependencies

How to analyze:

* inject provider failures
* simulate network drop mid-request
* retry the same payment callback
* compare stored state with provider state

---

## 4. UX analysis

Check:

* form length
* field ordering
* error readability
* navigation clarity
* trust cues
* status visibility
* empty states
* progress feedback

How to analyze:

* watch users complete the request flow
* identify drop-off points
* test with real low-end devices
* measure time-to-complete a delivery request
* verify error messages are actionable, not vague

---

## 5. Accessibility analysis

Check:

* text legibility
* contrast
* tap target size
* keyboard behavior
* screen-reader friendliness
* state announcement for important actions

How to analyze:

* inspect with accessibility tooling
* test with system font scaling
* test one-handed use
* ensure buttons and status labels are not visually ambiguous

---

## 6. Data integrity analysis

Check:

* shipment state transitions
* payment state synchronization
* duplicate request prevention
* audit trail completeness
* relationship consistency between users, shipments, and payments

How to analyze:

* verify every critical action writes a record
* test transaction rollback cases
* ensure state transitions are legal only
* check for orphaned records

---

## 7. Operational analysis

Check:

* admin workload
* request volume handling
* escalation flow
* support ticket handling
* manual override procedures
* monitoring and alerting

How to analyze:

* simulate a busy day
* observe admin dashboard workload
* identify where humans must intervene
* define escalation thresholds

---

## 8. Financial analysis

Check:

* price calculation correctness
* payment reconciliation
* refund handling
* failed transaction handling
* provider fees
* reporting accuracy

How to analyze:

* compare calculated price vs actual transaction record
* test partial failure scenarios
* validate all monetary values with strict decimal handling
* ensure no floating-point nonsense in money logic

---

## 9. Compliance and policy analysis

Check:

* service terms
* prohibited package handling
* liability wording
* privacy handling
* regional policy enforcement

How to analyze:

* review legal text
* validate data retention behavior
* determine what customer data is stored and why
* define how disputes are handled

---

## 10. App store readiness analysis

Check:

* crash-free startup
* permissions rationale
* policy compliance
* content correctness
* build signing
* versioning
* update behavior

How to analyze:

* run release builds only
* test Play Store submission requirements
* inspect permission prompts
* confirm iOS/Android packaging consistency

---

# Practical UI Analysis Checklist

This matters because bad UI kills adoption even if the backend is strong.

## Analyze:

* whether the home screen shows the next action clearly
* whether the delivery request form is too long
* whether weight and region errors are visible before submission
* whether pricing is shown early enough to prevent surprises
* whether tracking is understandable without support
* whether admin views are dense but usable
* whether status colors and labels are unambiguous
* whether users can resume incomplete requests
* whether the app works on small screens and low RAM devices

## How to analyze properly

* task-based usability testing
* screen-by-screen review against business flows
* tap-path minimization
* form validation testing
* confusion-point logging
* edge-case visual testing for long names, long addresses, and poor network states

---

# Critical production concern: money and state

Your app has **two dangerous systems**:

1. payment state
2. shipment state

They must not drift apart.

That means:

* a paid request must not appear unpaid
* a delivered package must not be open for another payment attempt
* a failed payment must not auto-advance shipment state
* admin overrides must be logged

This is where production systems break when built casually.



