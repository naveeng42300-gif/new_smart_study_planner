require("dotenv").config();

const express = require("express");
const session = require("express-session");
const MongoClient = require("mongodb").MongoClient;
const { ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const path = require("path");
const MongoStoreModule = require("connect-mongo");
const MongoStore = MongoStoreModule.default || MongoStoreModule;

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!MONGODB_URI) throw new Error("MONGODB_URI is missing from environment variables.");
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be set to a random secret at least 32 characters long.");
}

const client = new MongoClient(MONGODB_URI);

app.set("trust proxy", 1);
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

let users;
let tasks;

app.use(session({
  name: "studyplanner.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    client,
    dbName: "smart_study_planner",
    collectionName: "sessions",
    ttl: 7 * 24 * 60 * 60
  }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Please log in to continue." });
  }
  next();
}

function validUsername(username) {
  // Letters only, Unicode letters supported; length 3-20.
  return typeof username === "string" &&
    username.length >= 3 &&
    username.length <= 20 &&
    /^\p{L}+$/u.test(username);
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

app.post("/api/register", async (req, res) => {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const password = req.body.password;

    if (!validUsername(username)) {
      return res.status(400).json({
        error: "Username must be 3–20 letters only. Numbers, spaces, and symbols are not allowed."
      });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: "Password must be 8–72 characters long." });
    }

    const existing = await users.findOne({ usernameLower: username.toLocaleLowerCase() });
    if (existing) return res.status(409).json({ error: "That username is already taken." });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await users.insertOne({
      username,
      usernameLower: username.toLocaleLowerCase(),
      password: passwordHash,
      createdAt: new Date()
    });

    req.session.regenerate((sessionError) => {
      if (sessionError) return res.status(500).json({ error: "Could not start your session. Please log in." });
      req.session.userId = result.insertedId.toString();
      req.session.username = username;
      req.session.save((saveError) => {
        if (saveError) return res.status(500).json({ error: "Account created, but login failed. Please log in." });
        res.status(201).json({ message: "Account created successfully.", username });
      });
    });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ error: "That username is already taken." });
    }
    console.error("Registration error:", error.message);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const password = req.body.password;

    if (!validUsername(username) || typeof password !== "string") {
      return res.status(400).json({ error: "Enter a valid username (letters only) and password." });
    }

    const user = await users.findOne({ usernameLower: username.toLocaleLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }

    req.session.regenerate((sessionError) => {
      if (sessionError) return res.status(500).json({ error: "Could not start your session. Please try again." });
      req.session.userId = user._id.toString();
      req.session.username = user.username;
      req.session.save((saveError) => {
        if (saveError) return res.status(500).json({ error: "Login failed. Please try again." });
        res.json({ message: "Welcome back!", username: user.username });
      });
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: "Not logged in." });
  res.json({ username: req.session.username });
});

app.post("/api/logout", (req, res) => {
  if (!req.session) return res.json({ message: "Logged out." });
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: "Could not log out. Please try again." });
    res.clearCookie("studyplanner.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });
    res.json({ message: "Logged out." });
  });
});

app.get("/api/tasks", requireLogin, async (req, res) => {
  try {
    const data = await tasks.find({ userId: req.session.userId }).sort({ createdAt: -1 }).toArray();
    res.json(data);
  } catch (error) {
    console.error("Load tasks error:", error.message);
    res.status(500).json({ error: "Could not load tasks." });
  }
});

app.post("/api/tasks", requireLogin, async (req, res) => {
  try {
    const subject = cleanText(req.body.subject, 60);
    const topic = cleanText(req.body.topic, 120);
    const date = cleanText(req.body.date, 10);
    const allowedPriorities = ["Low", "Medium", "High"];
    const priority = allowedPriorities.includes(req.body.priority) ? req.body.priority : "Medium";

    if (!subject || !topic || !date) {
      return res.status(400).json({ error: "Please complete all task fields." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return res.status(400).json({ error: "Please enter a valid due date." });
    }

    const task = {
      userId: req.session.userId,
      subject,
      topic,
      date,
      priority,
      completed: false,
      createdAt: new Date()
    };
    const result = await tasks.insertOne(task);
    res.status(201).json({ ...task, _id: result.insertedId });
  } catch (error) {
    console.error("Create task error:", error.message);
    res.status(500).json({ error: "Could not save this task." });
  }
});

app.patch("/api/tasks/:id", requireLogin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid task ID." });
    const result = await tasks.updateOne(
      { _id: new ObjectId(req.params.id), userId: req.session.userId },
      { $set: { completed: Boolean(req.body.completed) } }
    );
    if (!result.matchedCount) return res.status(404).json({ error: "Task not found." });
    res.json({ message: "Task updated." });
  } catch (error) {
    res.status(500).json({ error: "Could not update task." });
  }
});

app.delete("/api/tasks/:id", requireLogin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid task ID." });
    const result = await tasks.deleteOne({
      _id: new ObjectId(req.params.id),
      userId: req.session.userId
    });
    if (!result.deletedCount) return res.status(404).json({ error: "Task not found." });
    res.json({ message: "Task deleted." });
  } catch (error) {
    res.status(500).json({ error: "Could not delete task." });
  }
});

async function startServer() {
  try {
    await client.connect();
    const db = client.db("smart_study_planner");
    users = db.collection("users");
    tasks = db.collection("tasks");
    await users.createIndex({ usernameLower: 1 }, { unique: true });
    await tasks.createIndex({ userId: 1, createdAt: -1 });
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Smart Study Planner is running on port ${PORT}`);
      console.log("MongoDB connected successfully.");
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await client.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await client.close();
  process.exit(0);
});

startServer();
