import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { connectDB, getDB } from "./db.js";
import { loginUser } from "./getReqs/loginUser.js";
import { requireAuth, requireAuthPage, reverseAuthPage, reverseAuth } from "./auth.js";
import { createUser } from "./setReqs/createUser.js";
import { fetchData } from "./fetch.js";
import { getTeamByPreferenceKey } from "./teamData.js";
import { getPreferredData } from "./preferredData.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());


const isProd = process.env.NODE_ENV === "production";


// App Post Login Request
// Brief: Logging in the User
// Calls external loginUser function which interacts with mongoDB (most of the heavy lifting)
// Creates an auth cookie
// Returns the response object with the user's useful (not sensitive) information
app.post("/api/login", reverseAuth, async (req, res) => {
  const result = await loginUser(req.body);
  if (!result.passed) {
    return res.status(401).json({ error: result.message });
  }

  res.cookie("auth", result.chocolateChipCookie, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",         
    maxAge: 24 * 60 * 60 * 1000
  });

  return res.json({ username: req.body.username, preferences: result.preferences });
});

// App Post User Request
// Brief: Creates a new user and logs in
app.post("/api/user", reverseAuth, async (req,res) => {
    try {
        const userId = await createUser(req.body);
        const login = await loginUser({username: req.body.username, password: req.body.password});
        if (!login.passed) {
            throw new Error(login.message || "Unable to login newly created user");
        }

        res.cookie("auth", login.chocolateChipCookie, {
            httpOnly: true,
            secure: isProd,
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000
        });
        // successful case
        return res.status(201).json({ userId: userId, username: req.body.username, preferences: login.preferences });
    } catch (err) {
        return  res.status(400).json({ error: err.message });
    }
});

// App Post Preference Request
// Brief: Updates the Preferences Object
app.post("/api/preferences", requireAuth,  async (req, res) => {
    try {
        const preferences = req.body.preferences;
        if (typeof preferences !== "object") {
            return res.status(400).json({ error: "Invalid preferences format" });
        }
        if (preferences?.team !== undefined) {
            const team = await getTeamByPreferenceKey(preferences.team);
            if (!team) {
                return res.status(400).json({ error: "Invalid team key. Use location-only team names." });
            }
        }

        if (!req.user?.id) {
            return res.status(401).json({ error: "not logged in" });
        }

        const db = getDB();
        await db.collection("users").updateOne(
            { _id: new ObjectId(req.user.id) },
            { $set: { preferences: preferences } }
        );

        return res.json({ message: "Preferences updated successfully" });
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/updateUsr', requireAuth, async (req,res) => {
    try {
        const db = getDB();
        const { username, preferences } = req.body;
        if (!req.user?.id) {
            return res.status(401).json({ error: "not logged in" });
        }
        const update = {};

        if (typeof username === "string" && username.trim()) {
            update.username = username.trim();
        }

        if (preferences && typeof preferences === "object") {
            if (preferences?.team !== undefined) {
                const team = await getTeamByPreferenceKey(preferences.team);
                if (!team) {
                    return res.status(400).json({ error: "Invalid team key. Use location-only team names." });
                }
            }
            update.preferences = preferences;
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: "No valid fields to update" });
        }

        await db.collection("users").updateOne(
            { _id: new ObjectId(req.user.id) },
            { $set: update }
        );

        // Re-issue auth cookie if username changed
        if (update.username) {
            const secret = process.env.JWT_SECRET;
            if (secret) {
                const token = jwt.sign(
                    { userId: req.user.id, username: update.username },
                    secret,
                    { expiresIn: "1d" }
                );
                res.cookie("auth", token, {
                    httpOnly: true,
                    secure: isProd,
                    sameSite: "lax",
                    maxAge: 24 * 60 * 60 * 1000
                });
            }
        }

        return res.json({ message: "User updated successfully", username: update.username ?? req.user.username, preferences: update.preferences });
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
});

// Get requests:

// App Get Me Request
// Brief: Determines Whether or Not User is Logged In
// Checks whether the request body has a username, AND a valid jwt
app.get("/api/me", requireAuth, async (req, res) => {
    try {
        if (!req.user?.username) {
            return res.status(401).json({ error: "not logged in" });
        }
    
        const db = getDB();
        const user = await db.collection("users").findOne(
            { username: req.user.username },
            { projection: { passwordHash: 0 } }
        );

        if (!user) return res.status(401).json({ error: "not logged in" });

        return res.json({
            username: user.username,
            preferences: user.preferences ?? {},
        });
    } catch (err) {
        return res.status(500).json({ error: "server error" });
    }
});

// serving pages

// App Home Get Request
// Brief: Serves the Home Page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../pages/index.html"));
});


// App Login Get Request
// Brief: Serves Login page IFF the user is not logged in
app.get("/login", reverseAuthPage, (req, res) => {
    if (req.cookies?.auth) {
        return res.redirect("/");
    }
    res.sendFile(path.join(__dirname, "../pages/login.html"));
});
app.get("/login.html", reverseAuthPage, (req, res) => {
    if (req.cookies?.auth) {
        return res.redirect("/");
    }
    res.sendFile(path.join(__dirname, "../pages/login.html"));
});

// App Signup Get Request
// Brief: Serves the signup page IFF the user is not logged in
app.get("/signup", reverseAuthPage, (req, res) => {
    if (req.cookies?.auth) {
        return res.redirect("/");
    }
    res.sendFile(path.join(__dirname, "../pages/user.html"));
});
app.get("/user.html", reverseAuthPage, (req, res) => {
    if (req.cookies?.auth) {
        return res.redirect("/");
    }
    res.sendFile(path.join(__dirname, "../pages/user.html"));
});

// App Logout Get Request
// Clears the Cookie (jwt) and returns cleared user payload
app.get("/logout", requireAuth, (req, res) => {
    res.clearCookie("auth", {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
    });
    req.user = null;
    return res.redirect("/");
});

// App Pref Get Request
// Brief: Serves the team setter only if logged in AND no team is set; otherwise redirect home
app.get("/pref", requireAuthPage, async (req,res) => {
    try {
        const db = getDB();
        const user = await db.collection("users").findOne(
            { username: req.user?.username },
            { projection: { preferences: 1, username: 1 } }
        );

        // If user missing or already has a team, go home
        if (!user || user.preferences?.team) {
            return res.redirect("/");
        }

        return res.sendFile(path.join(__dirname, "../pages/pref.html"));
    } catch (err) {
        return res.redirect("/");
    }
});

// App Settings Get Request
// Brief: Serves settings.html IFF the user is logged in
app.get("/settings", requireAuthPage, async (req, res) => {
    try {
        const db = getDB();
        const user = await db.collection("users").findOne(
            {username: req.user?.username},
            {projection: {preferences: 1, username: 1}}
        );

        if (!user) {
            return res.redirect("/");
        }

        return res.sendFile(path.join(__dirname, "../pages/settings.html"));
    } catch (err) {
        return res.redirect("/");
    }
});

// App Dashboard Get Request
// Brief: Serves dashboard page IFF user is logged in
app.get("/dashboard", requireAuthPage, async (req,res) => {
    try {
        const db = getDB();
        const user = await db.collection("users").findOne(
            {username: req.user?.username},
            {projection: {preferences: 1, username: 1}}
        );

        if (!user) {
            return res.redirect("/");
        }

        return res.sendFile(path.join(__dirname, "../pages/dash.html"));
    } catch (err) {
        return res.redirect("/");
    }
});

// App News Get Request
// Brief: Serves news page IFF user is logged in
app.get("/news", requireAuthPage, async (req,res) => {
    try {
        const db = getDB();
        const user = await db.collection("users").findOne(
            {username: req.user?.username},
            {projection: {preferences: 1, username: 1}}
        );

        if (!user) {
            return res.redirect("/");
        }

        return res.sendFile(path.join(__dirname, "../pages/news.html"));
    } catch (err) {
        return res.redirect("/");
    }
});

// App Schedule Get Request
// Brief: Serves schedule page IFF user is logged in
app.get("/schedule", requireAuthPage, async (req,res) => {
    try {
        const db = getDB();
        const user = await db.collection("users").findOne(
            {username: req.user?.username},
            {projection: {preferences: 1, username: 1}}
        );

        if (!user) {
            return res.redirect("/");
        }

        return res.sendFile(path.join(__dirname, "../pages/schedule.html"));
    } catch (err) {
        return res.redirect("/");
    }
});

// App Stats Get Request
// Brief: Serves stats page IFF user is logged in
app.get("/stats", requireAuthPage, async (req,res) => {
    try {
        const db = getDB();
        const user = await db.collection("users").findOne(
            {username: req.user?.username},
            {projection: {preferences: 1, username: 1}}
        );

        if (!user) {
            return res.redirect("/");
        }

        return res.sendFile(path.join(__dirname, "../pages/stats.html"));
    } catch (err) {
        return res.redirect("/");
    }
});

// App Teams Get Request
// Brief: Serves teams page IFF user is logged in
app.get("/teams", requireAuthPage, async (req,res) => {
    try {
        const db = getDB();
        const user = await db.collection("users").findOne(
            {username: req.user?.username},
            {projection: {preferences: 1, username: 1}}
        );

        if (!user) {
            return res.redirect("/");
        }

        return res.sendFile(path.join(__dirname, "../pages/teams.html"));
    } catch (err) {
        return res.redirect("/");
    }
});


// App dash.html Get Request
// Brief: rejects request and redirects to /dashboard
app.get("/dash.html", (req,res) => {
    return res.redirect("/dashboard");
})

// App news.html Get Request
// Brief: rejects request and redirects to /news
app.get("/news.html", (req, res) => {
    return res.redirect("/news")
});

// App players.html Get Request
// Brief: rejects request and redirects to /players
app.get("/players.html", (req, res) => {
    return res.redirect("/players")
});

// App schedule.html Get Request
// Brief: rejects request and redirects to /schedule
app.get("/schedule.html", (req, res) => {
    return res.redirect("/schedule")
});

// App stats.html Get Request
// Brief: rejects request and redirects to /stats
app.get("/stats.html", (req, res) => {
    return res.redirect("/stats")
});

// App teams.html Get Request
// Brief: rejects request and redirects to /teams
app.get("/teams.html", (req, res) => {
    return res.redirect("/teams")
});

// Protect direct .html hits for restricted pages
app.get("/settings.html", requireAuthPage, (req, res) => {
    return res.sendFile(path.join(__dirname, "../pages/settings.html"));
});

app.get("/pref.html", requireAuthPage, (req, res) => {
    return res.sendFile(path.join(__dirname, "../pages/pref.html"));
});

// App Team Get Request
// Brief: Serves specified team info from json object
app.get('/api/team/:id', async (req, res) => {
    try {
        const team = await getTeamByPreferenceKey(req.params.id);
        if (!team) {
            return res.status(404).json({ message: "Team not found" });
        }
        res.json(team);
    } catch (err) {
        res.status(500).json({message: "Server Error"});
    }
});

app.get("/api/preferred-data", requireAuth, async (req, res) => {
    try {
        if (!req.user?.username) {
            return res.status(401).json({ error: "not logged in" });
        }

        const db = getDB();
        const user = await db.collection("users").findOne(
            { username: req.user.username },
            { projection: { username: 1, preferences: 1 } }
        );

        if (!user) {
            return res.status(401).json({ error: "not logged in" });
        }

        const preferredTeamKey = user.preferences?.team;
        const team = await getTeamByPreferenceKey(preferredTeamKey);
        if (!team) {
            return res.status(400).json({ error: "No valid preferred team set" });
        }

        const includeParam = String(req.query.include || "stats,players,schedule");
        const include = new Set(
            includeParam
                .split(",")
                .map((value) => value.trim().toLowerCase())
                .filter((value) => value === "stats" || value === "players" || value === "schedule")
        );

        if (include.size === 0) {
            include.add("stats");
            include.add("players");
            include.add("schedule");
        }

        const season = Number(req.query.season) || 2025;
        const preferredData = await getPreferredData({ team, season, include });

        return res.json({
            username: user.username,
            preferences: user.preferences ?? {},
            team,
            season,
            ...preferredData,
        });
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
});

// App Team Stats Get Request
// Brief: Proxies team stats from SportsDataIO for a given team id
app.get("/api/team/:id/stats", requireAuth, async (req, res) => {
    try {
        const teamId = Number(req.params.id);
        const season = Number(req.query.season) || 2025;

        if (!Number.isFinite(teamId)) {
            return res.status(400).json({ error: "Invalid team id" });
        }

        const stats = await fetchData(teamId, season);
        if (!stats || stats.ok !== "yes") {
            return res.status(502).json({ error: "Unable to fetch team stats" });
        }

        return res.json(stats);
    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
});



console.log("Connecting to database and starting server...");
await connectDB();
app.listen(process.env.PORT || 3000);

// static assets (after protected routes)
app.use(express.static(path.join(__dirname, "../pages")));
