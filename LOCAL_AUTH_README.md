# Local Authentication and History Implementation

This system implements a **demo-grade** local authentication and history storage system using browser localStorage. 

## ⚠️ Important Notice
**NOT FOR PRODUCTION USE** - This is designed for hackathon demos and local testing only.

## Features Implemented

### 1. Authentication (`/src/app/lib/local-auth.ts`)
- **Sign Up**: Create new user accounts with email, password, and name
- **Login**: Authenticate existing users
- **Logout**: Clear current session
- **Password Hashing**: Simple hash function (NOT cryptographically secure)
- **Persistence**: Uses localStorage for user data storage

### 2. History Storage (`/src/app/lib/local-history.ts`)
- **Per-User Storage**: Each user's analysis history is stored separately
- **Complete Analysis Results**: Stores full GraphAnalysisResult including:
  - Suspicious nodes
  - Fraud rings
  - Transaction metadata
  - Risk scores
- **Rehydration**: Properly converts stored JSON back to Map objects
- **Statistics Tracking**: Stores summary stats for quick display

### 3. UI Integration
- **LoginModal**: Local auth instead of Supabase
- **HistoryView**: Displays past analyses with ability to:
  - Click to reload analysis
  - Delete entries
  - View stats (volume, risks, rings)
- **App.tsx**: 
  - Shows user info in header and sidebar
  - Auto-saves analysis after completion
  - Loads user on app start
  - Handles logout

## User Experience Flow

1. **First Visit**: User sees login prompt in header
2. **Sign Up**: Creates account (stored in localStorage)
3. **Upload CSV**: Analyzes transactions
4. **Auto-Save**: Analysis automatically saved to history
5. **View History**: Click History in sidebar to see past analyses
6. **Reload**: Click any history item to view results again
7. **Logout**: Clears session but preserves history

## Data Storage Keys

- `aml_users` - Array of all registered users
- `aml_current_user` - Currently logged-in user
- `analysisHistory_{userId}` - Per-user analysis history

## Browser Compatibility

Requires localStorage support. Shows error message if unavailable.

## Limitations (By Design)

- No server-side validation
- No password recovery
- No email verification
- Simple hash (not bcrypt/scrypt)
- No session expiration
- Data loss if localStorage cleared
- No multi-device sync

## For Production Migration

To make this production-ready, replace with:
- Proper backend authentication (OAuth, JWT)
- Secure password hashing (bcrypt, Argon2)
- Database storage (PostgreSQL, MongoDB)
- Session management
- Email verification
- Rate limiting
- HTTPS enforcement
