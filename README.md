
# ContactManager_Backend

A **Node.js** backend API for a contact management system, featuring secure user authentication and full CRUD operations for managing contacts.

---

##  Features

- **User Authentication** — Secure registration and login with JWT-based token authentication.
- **Contact CRUD** — Create, Read, Update, and Delete contact entries tied to user accounts.
- **RESTful API** — Organized and intuitive endpoints for straightforward client integration.

---

##  Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v14+ recommended)
- [MongoDB](https://www.mongodb.com/) (local or cloud-hosted instance)
- **npm** (comes bundled with Node.js)

---

##  Installation and Setup

1. **Clone the repository**  
   ```bash
   git clone https://github.com/syedmusab31/ContactManager_Backend.git
   cd ContactManager_Backend

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the project root. At minimum, include:

   ```env
   PORT=5000
   MONGODB_URI=<your-mongodb-connection-string>
   JWT_SECRET=<your-secret-key>
   JWT_EXPIRE=30d
   ```

4. **Start the server**

   ```bash
   npm run dev
   ```

   The API will be accessible at `http://localhost:<PORT>` (defaults to `5000`).

---

## Project Structure (Suggested)

```
├── config/       # Database connection and configuration
├── controllers/  # Request handlers and business logic
├── middleware/   # JWT authentication, error handling, etc.
├── models/       # Mongoose schemas and models
├── routes/       # API endpoints mapping
├── utils/        # Utility functions
├── .env          # Environment variables (ignored by git)
├── package.json  # Project dependencies and scripts
└── server.js     # Application entry point
```

---

## API Endpoints (Example)

| Method | Endpoint             | Description                  | Access  |
| ------ | -------------------- | ---------------------------- | ------- |
| POST   | `/api/auth/register` | User registration            | Public  |
| POST   | `/api/auth/login`    | Login and retrieve JWT token | Public  |
| GET    | `/api/contacts`      | Retrieve all user contacts   | Private |
| POST   | `/api/contacts`      | Add a new contact            | Private |
| PUT    | `/api/contacts/:id`  | Update a specific contact    | Private |
| DELETE | `/api/contacts/:id`  | Delete a specific contact    | Private |

> **Note:** All private endpoints require the following header:
> `Authorization: Bearer <JWT_TOKEN>`

---

## Security & Best Practices

* Passwords are securely hashed (e.g., via bcrypt).
* API routes are protected with JWT-based authentication.
* Environment variables keep sensitive data out of version control.

---

## Contributing

Contributions are welcome! Please follow standard GitHub practices:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push the branch (`git push origin feature/YourFeature`)
5. Open a Pull Request for review

---

## License

This project is licensed under the **MIT License**. Feel free to use, modify, and distribute.

---
