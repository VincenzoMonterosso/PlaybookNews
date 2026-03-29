import bcrypt from 'bcrypt';
import { getDB } from '../db.js';

const SALT_ROUNDS = 15;
const USERS_COLLECTION = 'users';

// validate Helper
// @param1: username a string that represents the user's username
// @param2: password a string that represents the user's password
// @param3: email a string that represents the user's email
// Return: an err msg (if any), null if validated
function validate({username, password, email}) {
    if (!username || typeof username !== 'string' || username.length < 3) {
        return 'Username must be at least 3 characters long.';
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
        return 'Password must be at least 6 characters long.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
        return 'Invalid email address.';
    }
    return null;
}

// createUsr
// @param1: username
// @param2: password
// @param3: email
// @param4 preferences (optional object)
// Brief: inserts new account into DB if its now duplicate AND if its valid (insertOne handles most of this)
// Return: insert Id if successful
export async function createUser({username, password, email, preferences = {}}) {
    let err = validate({username, password, email, preferences});
    if (err) {
        throw new Error(err);
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = {
        username: username.toLowerCase(),
        password: hash,
        email: email.toLowerCase(),
        preferences,
        createdAt: new Date(),
    };
    const db = getDB();
    let result;
    try {
        result = await db.collection(USERS_COLLECTION).insertOne(user);
    } catch (e) {
        if (e?.code === 11000) {
            throw new Error('Username or email already exists.');
        }
        throw new Error('Error creating user: ' + e.message);
    }
    return result.insertedId;
}
