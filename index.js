const fs = require("fs");
const path = require("path");

// Load .env from backend folder or current working directory
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
let client;
let database;

// Connect to MongoDB Atlas
async function connectDatabase() {
    try {
        if (!process.env.MONGODB_URI) {
            console.warn("MONGODB_URI is not set. Please check your .env file.");
            return;
        }
        if (!client) {
            client = new MongoClient(process.env.MONGODB_URI);
        }
        await client.connect();
        database = client.db("fd_talk_show");
        console.log("MongoDB connected successfully!");
    } catch (err) {
        console.error("MongoDB connection warning:", err.message);
    }
}

// Home route
app.get("/", (req, res) => {
    res.send("FD Talk Show Backend is Working!");
});

// Test message route
app.get("/api/message", (req, res) => {
    res.json({
        message: "Welcome to FD Talk Show Backend!"
    });
});

// Backend status route
app.get("/api/status", (req, res) => {
    res.json({
        status: "success",
        message: "FD Talk Show backend is running!",
        database: database ? "connected" : "connecting"
    });
});

// Survey results route (Dynamic MongoDB aggregation with fallback)
app.get("/api/survey-results", async (req, res) => {
    try {
        if (!database) {
            const staticPath = path.join(__dirname, "..", "data", "survey_analysis.json");
            if (fs.existsSync(staticPath)) {
                return res.json({
                    status: "success",
                    source: "static_cache",
                    totalResponses: 31,
                    data: JSON.parse(fs.readFileSync(staticPath, "utf8"))
                });
            }
            return res.status(503).json({ message: "Database is not connected." });
        }

        const collection = database.collection("survey_responses");
        const responses = await collection.find({}).toArray();

        const questions = [
            { field: 'gender', id: 1, question: "1. What is your gender?" },
            { field: 'collegeOutfitPreference', id: 2, question: "2. What type of outfit do you prefer for college?" },
            { field: 'casualWearPreference', id: 3, question: "3. What do you prefer most in casual wear?" },
            { field: 'partyWearPreference', id: 4, question: "4. What type of party wear do you prefer?" },
            { field: 'importantOutfitFactor', id: 5, question: "5. What is most important when choosing an outfit?" },
            { field: 'inspirationSource', id: 6, question: "6. Where do you usually get fashion inspiration from?" },
            { field: 'reelsWatchFrequency', id: 7, question: "7. How often do you watch fashion/styling reels?" },
            { field: 'preferredStylingContent', id: 8, question: "8. Which type of styling content do you like most?" },
            { field: 'desiredWebsiteFeatures', id: 9, question: "9. What would you like to see on a fashion/styling website?" },
            { field: 'helpfulContentForDecisions', id: 10, question: "10. What type of fashion content helps you choose an outfit?" }
        ];

        const totalCount = responses.length;
        const analysis = {};

        questions.forEach(q => {
            const counts = {};
            let answered = 0;
            responses.forEach(r => {
                const val = r[q.field];
                if (val) {
                    counts[val] = (counts[val] || 0) + 1;
                    answered++;
                }
            });

            const breakdown = Object.entries(counts).map(([option, count]) => ({
                option,
                count,
                percentage: parseFloat(((count / (answered || 1)) * 100).toFixed(1))
            })).sort((a, b) => b.count - a.count);

            analysis[q.id] = {
                id: q.id,
                question: q.question,
                totalAnswered: answered,
                breakdown
            };
        });

        res.json({
            status: "success",
            source: "mongodb",
            totalResponses: totalCount,
            data: analysis
        });
    } catch (error) {
        console.error("Survey results error:", error);
        res.status(500).json({ message: "Unable to fetch survey results." });
    }
});

// Sign Up Route
app.post("/api/signup", async (req, res) => {
    try {
        if (!database) {
            return res.status(503).json({
                message: "Database is not connected."
            });
        }

        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill all fields."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters."
            });
        }

        const users = database.collection("users");

        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await users.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await users.insertOne({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            createdAt: new Date()
        });

        res.status(201).json({
            status: "success",
            message: "Account created successfully!"
        });

    } catch (error) {
        console.error("Signup error:", error);

        res.status(500).json({
            message: "Unable to create account."
        });
    }
});

// Login Route
app.post("/api/login", async (req, res) => {
    try {
        if (!database) {
            return res.status(503).json({
                message: "Database is not connected."
            });
        }

        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Please fill all fields."
            });
        }

        const users = database.collection("users");

        const normalizedEmail = email.trim().toLowerCase();

        const user = await users.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        res.status(200).json({
            status: "success",
            message: "Login successful!",
            user: {
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Unable to login."
        });
    }
});

// Contact form route
app.post("/api/contact", async (req, res) => {
    try {
        if (!database) {
            return res.status(503).json({
                message: "Database is not connected yet."
            });
        }

        const { name, email, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({
                message: "Please fill all fields."
            });
        }

        const contacts = database.collection("contacts");

        await contacts.insertOne({
            name,
            email,
            message,
            createdAt: new Date()
        });

        console.log("Contact saved to MongoDB!");

        res.status(201).json({
            status: "success",
            message: "Your message has been received and saved successfully!"
        });

    } catch (error) {
        console.error("Error saving contact:", error);

        res.status(500).json({
            status: "error",
            message: "Something went wrong while saving your message."
        });
    }
});

// Start server
async function startServer() {
    try {
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });

        // Connect to MongoDB in parallel
        connectDatabase().catch(err => {
            console.error("MongoDB Atlas connection error:", err.message);
        });
    } catch (error) {
        console.error("Server startup error:", error.message);
    }
}

startServer();
