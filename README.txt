STUDYFLOW / SMART STUDY PLANNER — SETUP

1. Back up your current project before replacing files.
2. Replace server.js, package.json, and the files inside public/ with the files in this package.
3. Create a private .env file in the project root. Use .env.example as a template.
4. Install dependencies:
   npm install
5. Start the app:
   npm start
6. Open:
   http://localhost:3000

LOCAL .env:
MONGODB_URI=mongodb://localhost:27017/
PORT=3000
SESSION_SECRET=use_a_long_random_secret_at_least_32_characters
NODE_ENV=development

RENDER:
- Set MONGODB_URI to your MongoDB Atlas connection URI in Render Environment.
- Set SESSION_SECRET to a different long random secret in Render Environment.
- Set NODE_ENV=production in Render Environment.
- Do not put the real .env file in GitHub.
- Redeploy after pushing the updated files.

USERNAME RULE:
Usernames must be 3–20 Unicode letters only. Numbers, spaces, punctuation, and symbols are rejected on both frontend and server.
Passwords must be 8–72 characters. Passwords are hashed with bcrypt.

DATA NOTES:
This version only returns tasks with the current user's userId. Tasks created by the old version that have no userId will not appear in the upgraded planner. They are not automatically deleted. Back up data before migrating any old tasks.
Users created with the old version may not have usernameLower. If a username fails to log in after upgrading, create a new account or carefully migrate the existing user records; do not delete your database to fix this.
