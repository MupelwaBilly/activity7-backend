/**
 * Express API entrypoint for the ICT251 Activity 7 IT Support Desk backend.
 * Configures CORS, JSON parsing, marker API documentation at GET /,
 * database health checks at GET /health, CRUD routes, and JSON error handling.
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./db");
const recordsRouter = require("./routes/records");

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRequestBaseUrl(req) {
  const configuredUrl = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : "";
}

function renderApiGuideHtml(baseUrl) {
  const safeBaseUrl = escapeHtml(baseUrl || "http://localhost:3000");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IT Support Desk API — ICT251 Activity 7</title>
  <style>
    body {
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      line-height: 1.55;
      color: #0f172a;
      background: #f4f7fb;
      margin: 0;
      padding: 1.5rem 1rem;
    }
    main {
      max-width: 920px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d6e0ec;
      border-radius: 12px;
      padding: 1.5rem;
    }
    h1, h2 { color: #1456a0; margin-top: 1.4rem; }
    h1 { margin-top: 0; }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      background: #f1f5f9;
      border-radius: 6px;
    }
    code { padding: 0.15rem 0.35rem; }
    pre { padding: 0.9rem; overflow-x: auto; border: 1px solid #d6e0ec; }
    table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; }
    th, td {
      border: 1px solid #d6e0ec;
      padding: 0.55rem 0.7rem;
      text-align: left;
    }
    th { background: #e8f1fb; }
    .notice {
      background: #fef3c7;
      border: 1px solid #fde68a;
      color: #92400e;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin: 1rem 0;
    }
    .links a {
      display: inline-block;
      margin-right: 1rem;
      color: #1456a0;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <main>
    <h1>IT Support Desk API (ICT251 — Activity 7)</h1>
    <p>
      <strong>Student Name:</strong> Mupelwa Sichilima &nbsp;|&nbsp;
      <strong>Student Number:</strong> 202501762
    </p>
    <p>
      Independent Node.js and Express REST API for recording, reading, updating,
      and deleting campus computer support requests across network, software,
      hardware, account access, and peripherals.
    </p>

    <div class="notice">
      <strong>Hosting notice:</strong> Free hosted services (such as Render Free)
      may pause when idle, so the first request after inactivity can take
      30&ndash;60 seconds while the server wakes up.
    </div>

    <h2>Live Base URL &amp; Quick Links</h2>
    <p><strong>Base URL:</strong> <code>${safeBaseUrl}</code></p>
    <p class="links">
      <a href="${safeBaseUrl}/health">Check Database Health (/health)</a>
      <a href="${safeBaseUrl}/api/records">View All Records (/api/records)</a>
    </p>

    <h2>Required Routes</h2>
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Route</th>
          <th>Purpose</th>
          <th>Success Status</th>
        </tr>
      </thead>
      <tbody>
        <tr><td><code>GET</code></td><td><code>/</code></td><td>API documentation guide for the marker</td><td>200</td></tr>
        <tr><td><code>GET</code></td><td><code>/health</code></td><td>Verify server and database connectivity</td><td>200 (or 503 on DB error)</td></tr>
        <tr><td><code>GET</code></td><td><code>/api/records</code></td><td>Read all support requests ordered by <code>id</code></td><td>200</td></tr>
        <tr><td><code>GET</code></td><td><code>/api/records/:id</code></td><td>Read one support request by positive integer <code>id</code></td><td>200</td></tr>
        <tr><td><code>POST</code></td><td><code>/api/records</code></td><td>Create a new support request (server generates <code>id</code>)</td><td>201</td></tr>
        <tr><td><code>PUT</code></td><td><code>/api/records/:id</code></td><td>Replace all four editable fields keeping original <code>id</code></td><td>200</td></tr>
        <tr><td><code>DELETE</code></td><td><code>/api/records/:id</code></td><td>Delete a support request by <code>id</code></td><td>200</td></tr>
      </tbody>
    </table>

    <h2>Input Fields &amp; Validation Rules</h2>
    <ul>
      <li><code>id</code>: Positive whole number generated by the database (do not send in POST/PUT; any supplied <code>id</code> is ignored).</li>
      <li><code>title</code>: String, 3 to 80 characters after trimming.</li>
      <li><code>category</code>: String, 2 to 40 characters after trimming (e.g., Network, Software, Hardware, Account &amp; Access, Printers &amp; Peripherals).</li>
      <li><code>description</code>: String, 5 to 300 characters after trimming.</li>
      <li><code>status</code>: Exact string &mdash; one of <code>Pending</code>, <code>In progress</code>, or <code>Completed</code>.</li>
    </ul>

    <h2>Example POST / PUT JSON Body</h2>
    <p>Send with header <code>Content-Type: application/json</code>:</p>
    <pre>{
  "title": "Campus Wi-Fi drops in Computer Lab 3",
  "category": "Network",
  "description": "Student laptops disconnect from the campus Wi-Fi every few minutes in Lab 3.",
  "status": "Pending"
}</pre>

    <h2>Expected Status Codes &amp; Error Format</h2>
    <ul>
      <li><code>200 OK</code> &mdash; Successful GET, PUT, DELETE, or <code>/health</code> check.</li>
      <li><code>201 Created</code> &mdash; Successful POST returning the newly created record with its database-generated <code>id</code>.</li>
      <li><code>400 Bad Request</code> &mdash; Invalid input fields, invalid <code>:id</code>, or malformed JSON.</li>
      <li><code>404 Not Found</code> &mdash; Valid <code>:id</code> does not exist or unknown route.</li>
      <li><code>500 Internal Server Error</code> &mdash; Unexpected server failure.</li>
      <li><code>503 Service Unavailable</code> &mdash; Database connectivity failure on <code>/health</code>.</li>
    </ul>
    <p>All error responses return JSON in the form <code>{"message": "..."}</code>.</p>
  </main>
</body>
</html>`;
}

app.get("/", (req, res) => {
  res.status(200).type("html").send(renderApiGuideHtml(getRequestBaseUrl(req)));
});

app.get("/health", async (req, res) => {
  try {
    await pool.healthCheck();
    res.status(200).json({
      status: "ok",
      database: "connected",
      storage: pool.getStorageMode(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({ message: "Database health check failed." });
  }
});

app.use("/api/records", recordsRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use((error, req, res, next) => {
  const isMalformedJson =
    error instanceof SyntaxError &&
    error.status === 400 &&
    "body" in error;

  if (isMalformedJson || error.type === "entity.parse.failed") {
    res.status(400).json({ message: "Malformed JSON in request body." });
    return;
  }

  console.error("Unhandled server error:", error);
  res.status(500).json({ message: "An unexpected server error occurred." });
});

async function startServer() {
  try {
    await pool.initDatabase();
    const port = Number(process.env.PORT) || 3000;
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(
        `Server listening on port ${port} (${pool.getStorageMode()})`
      );
    });

    const shutdown = async () => {
      server.close(async () => {
        await pool.close();
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to initialize database or start server:", error);
    process.exit(1);
  }
}

startServer();
