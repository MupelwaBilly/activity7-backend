/**
 * Express router implementing CRUD operations for /api/records.
 * Enforces strict server-side type, length, status, and positive-id rules
 * independent of any frontend validation.
 */

const router = require("express").Router();
const pool = require("../db");

const ALLOWED_STATUSES = Object.freeze([
  "Pending",
  "In progress",
  "Completed",
]);

const FIELD_RULES = Object.freeze([
  Object.freeze({ key: "title", label: "Title", min: 3, max: 80 }),
  Object.freeze({ key: "category", label: "Category", min: 2, max: 40 }),
  Object.freeze({ key: "description", label: "Description", min: 5, max: 300 }),
]);

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function parsePositiveId(rawId) {
  if (typeof rawId !== "string" || !POSITIVE_INTEGER_PATTERN.test(rawId)) {
    return null;
  }

  const parsed = Number(rawId);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Validates that the four editable fields are strings before trimming,
 * conform to length/status rules, and ignores any client-supplied id.
 */
function validateRecordBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const cleaned = {};

  for (const rule of FIELD_RULES) {
    const rawValue = body[rule.key];
    if (typeof rawValue !== "string") {
      return { error: `${rule.label} must be a string.` };
    }

    const trimmed = rawValue.trim();
    if (trimmed.length < rule.min || trimmed.length > rule.max) {
      return {
        error: `${rule.label} must have ${rule.min} to ${rule.max} characters.`,
      };
    }

    cleaned[rule.key] = trimmed;
  }

  if (typeof body.status !== "string") {
    return { error: "Status must be a string." };
  }

  const trimmedStatus = body.status.trim();
  if (!ALLOWED_STATUSES.includes(trimmedStatus)) {
    return {
      error: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}.`,
    };
  }

  cleaned.status = trimmedStatus;
  return { data: cleaned };
}

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, title, category, description, status FROM records ORDER BY id"
    );
    res.status(200).json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  const recordId = parsePositiveId(req.params.id);
  if (recordId === null) {
    res.status(400).json({ message: "Record id must be a positive whole number." });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT id, title, category, description, status FROM records WHERE id = $1",
      [recordId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "Record not found." });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  const validation = validateRecordBody(req.body);
  if (validation.error) {
    res.status(400).json({ message: validation.error });
    return;
  }

  const { title, category, description, status } = validation.data;

  try {
    const result = await pool.query(
      "INSERT INTO records (title, category, description, status) " +
        "VALUES ($1, $2, $3, $4) " +
        "RETURNING id, title, category, description, status",
      [title, category, description, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  const recordId = parsePositiveId(req.params.id);
  if (recordId === null) {
    res.status(400).json({ message: "Record id must be a positive whole number." });
    return;
  }

  const validation = validateRecordBody(req.body);
  if (validation.error) {
    res.status(400).json({ message: validation.error });
    return;
  }

  const { title, category, description, status } = validation.data;

  try {
    const result = await pool.query(
      "UPDATE records SET title = $1, category = $2, description = $3, status = $4 " +
        "WHERE id = $5 " +
        "RETURNING id, title, category, description, status",
      [title, category, description, status, recordId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "Record not found." });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  const recordId = parsePositiveId(req.params.id);
  if (recordId === null) {
    res.status(400).json({ message: "Record id must be a positive whole number." });
    return;
  }

  try {
    const result = await pool.query(
      "DELETE FROM records WHERE id = $1 RETURNING id",
      [recordId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "Record not found." });
      return;
    }

    res.status(200).json({ message: "Record deleted." });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
