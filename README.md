# RouteLynk - Server API

**RouteLynk** is a comprehensive backend system for an Online Ticket Booking Platform. It handles user authentication, role-based access control (Admin, Vendor, User), ticket inventory management, and secure payment processing via Stripe.

---

## Technologies Used

- **Node.js**: Runtime environment.
- **Express.js**: Web framework for handling API requests.
- **MongoDB**: NoSQL database for storing users, tickets, and bookings.
- **JWT (JSON Web Token)**: Secure authentication and route protection.
- **Stripe**: Payment gateway integration.
- **Cors**: Cross-origin resource sharing configuration.
- **Dotenv**: Environment variable management.
- **Vercel**: Serverless deployment platform

---

## Key Features

- **Role-Based Access Control**: distinct permissions for Users, Vendors, and Admins.
- **Secure Authentication**: JWT-based login system for API protection.
- **Ticket Management**: Vendors can create and manage tickets; Admins approve or reject listings.
- **Smart Booking Logic**: Backend validation prevents booking expired tickets or exceeding available stock.
- **Fraud Protection**: Admins can ban fraudulent vendors, instantly rejecting all their active tickets.
- **Payment Integration**: Secure transaction processing via Stripe with automatic inventory updates.
- **Search & Filter**: Server-side support for searching routes and filtering by transport type.

---

## API Endpoints

### Public Routes

| Method | Endpoint              | Description                                          |
| :----- | :-------------------- | :--------------------------------------------------- |
| POST   | `/jwt`                | Generate access token on login                       |
| GET    | `/tickets`            | Retrieve tickets with search, filter, and pagination |
| GET    | `/tickets/advertised` | Get admin-selected advertised tickets                |
| GET    | `/tickets/latest`     | Get the most recently added tickets                  |
| GET    | `/tickets/:id`        | Get details of a specific ticket                     |

### User Routes (Protected)

| Method | Endpoint                 | Description                                           |
| :----- | :----------------------- | :---------------------------------------------------- |
| POST   | `/bookings`              | Book a ticket (Validation for date and stock applied) |
| GET    | `/bookings/user/:email`  | View booking history                                  |
| POST   | `/create-payment-intent` | Generate payment secret for Stripe                    |
| POST   | `/payments`              | Process payment and update ticket quantity            |

### Vendor Routes (Protected)

| Method | Endpoint                 | Description                                          |
| :----- | :----------------------- | :--------------------------------------------------- |
| POST   | `/tickets`               | Create a new ticket                                  |
| GET    | `/tickets/vendor/:email` | View tickets added by the vendor                     |
| PATCH  | `/tickets/update/:id`    | Update ticket details (Locked if status is Rejected) |
| PATCH  | `/bookings/status/:id`   | Accept or Reject booking requests                    |
| GET    | `/vendor-stats/:email`   | View total revenue and sales statistics              |

### Admin Routes (Protected)

| Method | Endpoint                 | Description                                       |
| :----- | :----------------------- | :------------------------------------------------ |
| GET    | `/users`                 | View all registered users                         |
| PATCH  | `/users/role/:id`        | Promote user to Admin or Vendor                   |
| PATCH  | `/users/fraud/:id`       | Mark vendor as fraud (Bans user, rejects tickets) |
| GET    | `/tickets/admin`         | View all tickets for moderation                   |
| PATCH  | `/tickets/status/:id`    | Approve or Reject ticket listings                 |
| PATCH  | `/tickets/advertise/:id` | Toggle advertisement status (Max 6 limit)         |
