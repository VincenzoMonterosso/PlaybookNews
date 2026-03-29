import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { getDB } from "../db.js";

const COLLECTION = "users";

// signAuthToken Helper
// @param 1: user the username object retrieved from the DB
// Brief: creates jwt (way of verifying login quickly via frontend) if valid
// Error is very unlikely to be thrown but why not right?
// Return: jwt
function signAuthToken(user) {
  const payload = {
    userId: user._id,
    username: user.username,
  };
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Err creating auth token");
  return jwt.sign(payload, secret, { expiresIn: "1d" });
}

// Login User
// @param 1: username a string that represents the account username
// @param 2: password a string that represents the account password
// Brief: 1st checks username to see if it exists in DB, if not, no need to validate password and exits early
// 2nd uses Bcrypt.compare(uno, due) to check hashed password sefely
export async function loginUser({ username, password }) {
    if (typeof username !== "string" || typeof password !== "string") {
        return {passed: false, message: "Username and password must be strings"};
    }
    const db = getDB();
    const user = await db.collection(COLLECTION).findOne({username: username.trim()});

    if (!user) {
        return {passed: false, message: "Invalid username or password"};
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        return {passed: false, message: "Invalid username or password"};
    }
    const cookie = signAuthToken(user);

    return {passed: true, chocolateChipCookie: cookie, preferences: user.preferences};
}


